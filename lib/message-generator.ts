import type { FreeSlot } from "./google-calendar";

export type ToneLevel = "formal" | "casual" | "friendly";
export type MessageFormat = "bullet" | "table" | "prose";

export interface MessageOptions {
  slots: FreeSlot[];
  toName?: string;
  subject?: string;
  toneLevel: ToneLevel;
  format: MessageFormat;
  requiredDurationMinutes: number;
}

const WEEKDAYS_JA = ["日", "月", "火", "水", "木", "金", "土"];

function formatDate(date: Date): string {
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

function formatSlot(slot: FreeSlot): string {
  return `${formatDate(slot.start)} ${formatTime(slot.start)}〜${formatTime(slot.end)}`;
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

function buildBullet(slots: FreeSlot[], tone: ToneLevel, duration: number): string {
  const lines = slots.map((s, i) => `${i + 1}. ${formatSlot(s)}`);
  return `${lines.join("\n")}\n${DURATION_LABELS[tone](duration)}`;
}

function buildTable(slots: FreeSlot[], _tone: ToneLevel, duration: number): string {
  const header = "| # | 日付 | 時間 |\n|---|------|------|";
  const rows = slots.map(
    (s, i) =>
      `| ${i + 1} | ${formatDate(s.start)} | ${formatTime(s.start)}〜${formatTime(s.end)} |`
  );
  return `${header}\n${rows.join("\n")}\n\n所要時間：${formatDuration(duration)}`;
}

function buildProse(slots: FreeSlot[], tone: ToneLevel, duration: number): string {
  if (slots.length === 1) {
    return `${formatSlot(slots[0])}はいかがでしょうか。${DURATION_LABELS[tone](duration)}`;
  }
  const last = slots[slots.length - 1];
  const others = slots.slice(0, -1).map(formatSlot);
  return (
    `${others.join("、")}、または${formatSlot(last)}はいかがでしょうか。` +
    `\n${DURATION_LABELS[tone](duration)}`
  );
}

// ---- Main generator ----

export function generateMessage(options: MessageOptions): string {
  const { slots, toName, subject, toneLevel, format, requiredDurationMinutes } = options;

  if (slots.length === 0) return "候補となる空き時間が見つかりませんでした。";

  const greeting = GREETINGS[toneLevel](toName);
  const closing = CLOSINGS[toneLevel];

  let body: string;
  if (format === "bullet") {
    body = buildBullet(slots, toneLevel, requiredDurationMinutes);
  } else if (format === "table") {
    body = buildTable(slots, toneLevel, requiredDurationMinutes);
  } else {
    body = buildProse(slots, toneLevel, requiredDurationMinutes);
  }

  const parts: string[] = [];

  if (subject && (toName || true)) {
    if (toneLevel === "formal") {
      parts.push(`件名：${subject}`);
    } else if (toneLevel === "casual") {
      parts.push(`件名：${subject}`);
    }
    // タメ口は件名なし
  }

  parts.push(greeting);
  parts.push(body);
  parts.push(closing);

  return parts.filter(Boolean).join("\n\n");
}
