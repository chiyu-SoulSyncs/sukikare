import type { FreeSlot } from "./google-calendar";

export type ToneLevel = "formal" | "casual" | "friendly";
export type MessageFormat = "line" | "mail" | "plain";

export interface Signature {
  company?: string;  // 会社名
  department?: string; // 部署名
  name?: string;     // 氏名
}

export interface MessageOptions {
  slots: FreeSlot[];
  toName?: string;
  subject?: string;
  signature?: Signature;
  toneLevel: ToneLevel;
  format: MessageFormat;
  requiredDurationMinutes: number;
}

const WEEKDAYS_JA = ["日", "月", "火", "水", "木", "金", "土"];

/** 短形式: 3/10(月) */
function formatDate(date: Date): string {
  const m = date.getMonth() + 1;
  const d = date.getDate();
  const w = WEEKDAYS_JA[date.getDay()];
  return `${m}/${d}(${w})`;
}

/** 長形式: 3月10日（月） */
function formatDateLong(date: Date): string {
  const m = date.getMonth() + 1;
  const d = date.getDate();
  const w = WEEKDAYS_JA[date.getDay()];
  return `${m}月${d}日（${w}）`;
}

function formatTime(date: Date): string {
  const h = date.getHours().toString().padStart(2, "0");
  const m = date.getMinutes().toString().padStart(2, "0");
  return `${h}:${m}`;
}

function formatDuration(minutes: number): string {
  if (minutes < 60) return `${minutes}分`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m > 0 ? `${h}時間${m}分` : `${h}時間`;
}

// ---- Tone templates ----

const GREETINGS: Record<ToneLevel, (toName?: string) => string> = {
  formal: (toName) =>
    toName
      ? `${toName}様\n\nお世話になっております。\nご都合をお伺いしたく、以下の日程はいかがでしょうか。`
      : `お世話になっております。\nご都合をお伺いしたく、以下の日程はいかがでしょうか。`,
  casual: (toName) =>
    toName
      ? `${toName}さん\n\nお疲れ様です！\n以下の日程でご都合はいかがでしょうか？`
      : `お疲れ様です！\n以下の日程でご都合はいかがでしょうか？`,
  friendly: (toName) =>
    toName
      ? `${toName}\n\nお疲れ！\n以下の日程どうかな？`
      : `以下の日程どうかな？`,
};

const CLOSINGS: Record<ToneLevel, string> = {
  formal: "ご確認のほど、よろしくお願いいたします。",
  casual: "ご確認よろしくお願いします！",
  friendly: "確認してみて！",
};

const DURATION_LABELS: Record<ToneLevel, (min: number) => string> = {
  formal: (min) => `（所要時間：${formatDuration(min)}を予定しております）`,
  casual: (min) => `（所要時間：${formatDuration(min)}くらい）`,
  friendly: (min) => `（${formatDuration(min)}くらい）`,
};

// ---- Format builders ----

/**
 * LINE向け: ●付きシンプル箇条書き
 * 例: ● 3/10(月) 10:00〜11:00
 */
function buildLine(slots: FreeSlot[], tone: ToneLevel, duration: number): string {
  const lines = slots.map((s) => `● ${formatDate(s.start)} ${formatTime(s.start)}〜${formatTime(s.end)}`);
  return `${lines.join("\n")}\n${DURATION_LABELS[tone](duration)}`;
}

/**
 * メール向け: 「●」付きで日付を丁寧に列挙
 * 例: ● 3月10日（月） 10:00〜11:00
 */
function buildMail(slots: FreeSlot[], tone: ToneLevel, duration: number, sig?: Signature): string {
  const lines = slots.map((s) => `● ${formatDateLong(s.start)} ${formatTime(s.start)}〜${formatTime(s.end)}`);
  const body = `${lines.join("\n")}\n${DURATION_LABELS[tone](duration)}`;
  if (!sig || (!sig.company && !sig.department && !sig.name)) return body;
  const sigLines: string[] = [];
  if (sig.company) sigLines.push(sig.company);
  if (sig.department) sigLines.push(sig.department);
  if (sig.name) sigLines.push(sig.name);
  return `${body}\n\n--\n${sigLines.join("\n")}`;
}

/**
 * そのままコピー向け: 挨拶なし、「●」で日程だけ列挙
 * 例: ● 3/10(月) 10:00〜11:00
 */
function buildPlain(slots: FreeSlot[], duration: number): string {
  const lines = slots.map((s) => `● ${formatDate(s.start)} ${formatTime(s.start)}〜${formatTime(s.end)}`);
  return `${lines.join("\n")}\n（${formatDuration(duration)}）`;
}

// ---- Main generator ----

export function generateMessage(options: MessageOptions): string {
  const { slots, toName, subject, signature, toneLevel, format, requiredDurationMinutes } = options;

  if (slots.length === 0) return "候補となる空き時間が見つかりませんでした。";

  // 「そのままコピー」は挨拶・締めなし
  if (format === "plain") {
    return buildPlain(slots, requiredDurationMinutes);
  }

  const greeting = GREETINGS[toneLevel](toName);
  const closing = CLOSINGS[toneLevel];

  let body: string;
  if (format === "line") {
    body = buildLine(slots, toneLevel, requiredDurationMinutes);
  } else {
    // "mail"
    body = buildMail(slots, toneLevel, requiredDurationMinutes, signature);
  }

  const parts: string[] = [];

  // 件名はメール向けのみ
  if (format === "mail" && subject && toneLevel !== "friendly") {
    parts.push(`件名：${subject}`);
  }

  parts.push(greeting);
  parts.push(body);
  parts.push(closing);

  return parts.filter(Boolean).join("\n\n");
}
