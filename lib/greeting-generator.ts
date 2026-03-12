/**
 * 挨拶文メーカー - メッセージ生成ロジック
 *
 * 日本のビジネスメール/メッセージの正しい構成:
 *   1. 宛名（任意）
 *   2. 本文（挨拶 → 要件 → 詳細）
 *   3. 結びの言葉
 *   4. 署名（任意・ON/OFF切り替え可能）
 *      順序: 会社名 → 役職 → 氏名
 *
 * シーン:
 *   - intro       : グループ参加の自己紹介
 *   - thanks      : ミーティングお礼
 *   - reminder    : ミーティングリマインド
 *   - next        : 次回案内（日程調整依頼）
 *   - reply       : 返信（かしこまりました / 承知しました）
 */

export type GreetingScene = "intro" | "thanks" | "reminder" | "next" | "reply";
export type GreetingTone = "formal" | "casual" | "friendly";
/** 返信文の種類 */
export type ReplyStyle = "kashikomarimashita" | "shochishimashita";

/** 返信シーンの状況分岐 */
export type ReplySubtype =
  | "confirmed"      // 日程が決まった
  | "reschedule"     // 別候補を依頼
  | "declined"       // 断られた
  | "pending"        // 保留・検討中
  | "self_decline"   // こちらから辞辺
  | "change_request"; // 日程変更の依頼

export interface ProfileCard {
  id: number;
  label: string;
  name: string;
  company?: string | null;
  role?: string | null;
}

export interface MeetingInfo {
  purpose?: string;
  date?: string;   // 例: "9月12日 (金曜日)"
  time?: string;   // 例: "午後7:00〜8:00"
  location?: string; // 場所
  url?: string;      // 会議URL
  nextAction?: string;  // 弊社対応事項
  theirAction?: string; // 貴社対応事項
}

export interface GreetingSlot {
  date: string;   // 例: "9月9日 (火曜日)"
  time: string;   // 例: "午後4:00〜5:00"
}

export interface GenerateGreetingOptions {
  scene: GreetingScene;
  tone: GreetingTone;
  profile: ProfileCard;
  meeting?: MeetingInfo;
  slots?: GreetingSlot[];
  /** 次回案内シーン用: 検索タブから転送または手入力した日程候補テキスト */
  scheduleText?: string;
  /** 次回案内シーン用: MTGタイトル（例: 「〇〇についての打ち合わせ」） */
  mtgTitle?: string;
  /** 次回案内・リマインドシーン用: 開催場所 */
  location?: string;
  /** 次回案内・リマインドシーン用: 会議URL */
  meetingUrl?: string;
  /** リマインドシーン用: MTGタイトル */
  reminderTitle?: string;
  /** リマインドシーン用: 会議が今日か明日か */
  reminderDay?: "today" | "tomorrow";
  recipientName?: string;
  /** 署名を末尾に付けるかどうか（デフォルト: true） */
  includeSignature?: boolean;
  /** 返信文のスタイル（replyシーンのみ使用） */
  replyStyle?: ReplyStyle;
  /** 返信シーンの状況分岐 */
  replySubtype?: ReplySubtype;
  /** 日程確定時の確定日時テキスト */
  confirmedDate?: string;
  /** 日程変更依頼時の変更後候補テキスト */
  newScheduleText?: string;
}

// ─────────────────────────────────────────────
// 署名ヘルパー
// ─────────────────────────────────────────────

/**
 * 日本のビジネスメッセージ署名の正しい順序:
 *   会社名
 *   役職（肩書き）
 *   氏名
 *
 * 区切り線なし（LINEやチャットでも使いやすい形式）
 */
function signature(profile: ProfileCard, tone: GreetingTone): string {
  if (tone === "friendly") {
    return profile.name;
  }
  const lines: string[] = [];
  if (profile.company) lines.push(profile.company);
  if (profile.role) lines.push(profile.role);
  lines.push(profile.name);
  return lines.join("\n");
}

function maybeSignature(profile: ProfileCard, tone: GreetingTone, include: boolean): string {
  if (!include) return "";
  return `\n\n${signature(profile, tone)}`;
}

/**
 * 本文冒頭の挨拶文
 * ビジネス: 「お世話になっております。会社名の氏名でございます。」
 * カジュアル: 「お疲れ様です。会社名の氏名です。」
 * タメ口: 「お疲れ〜！名前だよ。」
 */
function openingGreeting(tone: GreetingTone, company: string, name: string): string {
  if (tone === "formal") {
    const companyStr = company ? `${company}の` : "";
    return `お世話になっております。\n${companyStr}${name}でございます。`;
  }
  if (tone === "casual") {
    const companyStr = company ? `${company}の` : "";
    return `お疲れ様です。\n${companyStr}${name}です。`;
  }
  return `お疲れ〜！\n${name}だよ。`;
}

/**
 * LINEやチャット向けの短い挨拶（自己紹介なし）
 */
function shortGreeting(tone: GreetingTone): string {
  if (tone === "formal") return "お世話になっております。";
  if (tone === "casual") return "お疲れ様です！";
  return "お疲れ〜！";
}

function closing(tone: GreetingTone): string {
  if (tone === "formal") return "何卒よろしくお願いいたします。";
  if (tone === "casual") return "引き続きよろしくお願いします！";
  return "よろしくね！";
}

/** URLかどうかを判定する（http/https始まりまたはzoom.us/teams.microsoft.com/meet.google.com等） */
function isUrl(value: string): boolean {
  return /^https?:\/\//i.test(value.trim()) ||
    /zoom\.us|teams\.microsoft\.com|meet\.google\.com|webex\.com/i.test(value.trim());
}

/** 場所/URLを自動判定して適切なラベルを返す */
function locationLabel(value: string): string {
  if (!value.trim()) return "";
  const label = isUrl(value.trim()) ? "■URL" : "■場所";
  return `${label}：${value.trim()}`;
}

function meetingBlock(meeting: MeetingInfo, extraLocation?: string, extraTitle?: string, extraUrl?: string): string {
  const lines: string[] = [];
  if (extraTitle?.trim()) lines.push(`■件名：${extraTitle.trim()}`);
  if (meeting.purpose) lines.push(`■目的：${meeting.purpose}`);
  if (meeting.date) lines.push(`■日付：${meeting.date}`);
  if (meeting.time) lines.push(`■時間：${meeting.time}`);
  const loc = extraLocation?.trim() || meeting.location;
  if (loc) lines.push(`■場所：${loc.trim()}`);
  const url = extraUrl?.trim() || meeting.url;
  if (url) lines.push(`■URL：${url.trim()}`);
  return lines.join("\n");
}

// ─────────────────────────────────────────────
// シーン別ビルダー
// ─────────────────────────────────────────────

function buildIntro(opts: GenerateGreetingOptions): string {
  const { profile, tone, recipientName, includeSignature = true } = opts;
  const company = profile.company ?? "";
  const name = profile.name;
  const roleStr = profile.role ? `${profile.role}の` : "";
  const sig = maybeSignature(profile, tone, includeSignature);

  if (tone === "formal") {
    const to = recipientName ? `${recipientName}の皆様\n\n` : "";
    return `${to}はじめまして。\n${company ? `${company}、` : ""}${roleStr}${name}と申します。\n\nこれからどうぞよろしくお願いいたします。${sig}`;
  }
  if (tone === "casual") {
    const to = recipientName ? `${recipientName}の皆さん\n\n` : "";
    return `${to}はじめまして！\n${company ? `${company}、` : ""}${roleStr}${name}です。\n\nよろしくお願いします！${sig}`;
  }
  return `はじめまして！${name}です。\nよろしくお願いします！${sig}`;
}

function buildThanks(opts: GenerateGreetingOptions): string {
  const { profile, tone, meeting, includeSignature = true } = opts;
  const company = profile.company ?? "";
  const name = profile.name;
  const sig = maybeSignature(profile, tone, includeSignature);

  if (tone === "formal") {
    // ビジネス丁寧語：冒頭に自己紹介あり
    const greet = openingGreeting(tone, company, name);
    let body = `${greet}\n\n本日はお忙しい中、お打ち合わせのお時間をいただき、誠にありがとうございました。\n打ち合わせの内容を以下にまとめましたので、ご確認いただけますと幸いです。`;
    if (meeting) {
      const block = meetingBlock(meeting);
      if (block) body += `\n\n【次回会議】\n${block}`;
      if (meeting.nextAction) body += `\n\n【弊社にて対応いたします】\n${meeting.nextAction}`;
      if (meeting.theirAction) body += `\n\n【ご対応をお願いしたい事項】\n${meeting.theirAction}`;
    }
    body += `\n\nご不明な点やご要望などございましたら、お気軽にお申し付けくださいませ。\n${closing(tone)}${sig}`;
    return body;
  }
  if (tone === "casual") {
    // カジュアル：LINEでも使いやすい短い挨拶（自己紹介なし）
    const greet = shortGreeting(tone);
    let body = `${greet}\n\n本日はお打ち合わせありがとうございました！`;
    if (meeting) {
      const block = meetingBlock(meeting);
      if (block) body += `\n\n【次回会議】\n${block}`;
      if (meeting.nextAction) body += `\n\n【弊社対応】\n${meeting.nextAction}`;
      if (meeting.theirAction) body += `\n\n【ご対応お願いしたいこと】\n${meeting.theirAction}`;
    }
    body += `\n\n${closing(tone)}${sig}`;
    return body;
  }
  // タメ口：LINEでも使いやすい短い形式（自己紹介なし）
  let body = `さっきはありがとう！`;
  if (meeting) {
    const lines: string[] = [];
    if (meeting.purpose) lines.push(`■目的：${meeting.purpose}`);
    if (meeting.date) lines.push(`■日付：${meeting.date}`);
    if (meeting.time) lines.push(`■時間：${meeting.time}`);
    if (meeting.location) lines.push(`■場所：${meeting.location}`);
    if (meeting.url) lines.push(`■URL：${meeting.url}`);
    if (lines.length > 0) body += `\n\n【次回会議】\n${lines.join("\n")}`;
    if (meeting.nextAction) body += `\n\n【こちらで対応すること】\n${meeting.nextAction}`;
    if (meeting.theirAction) body += `\n\n【対応してほしいこと】\n${meeting.theirAction}`;
  }
  body += `\n\n次回もよろしくお願いします！${sig}`;
  return body;
}

function buildReminder(opts: GenerateGreetingOptions): string {
  const { profile, tone, meeting, location, meetingUrl, reminderTitle, reminderDay = "tomorrow", includeSignature = true } = opts;
  const company = profile.company ?? "";
  const name = profile.name;
  const greet = openingGreeting(tone, company, name);
  const sig = maybeSignature(profile, tone, includeSignature);
  const dayLabel = reminderDay === "today" ? "本日" : "明日";

  const detailBlock = (loc?: string, url?: string, title?: string): string => {
    const lines: string[] = [];
    if (title?.trim()) lines.push(`■件名：${title.trim()}`);
    if (meeting?.date) lines.push(`■日付：${meeting.date}`);
    if (meeting?.time) lines.push(`■時間：${meeting.time}`);
    if (loc?.trim()) lines.push(`■場所：${loc.trim()}`);
    if (url?.trim()) lines.push(`■URL：${url.trim()}`);
    return lines.length > 0 ? lines.join("\n") : "";
  };

  if (tone === "formal") {
    const intro = reminderDay === "today"
      ? `${dayLabel}の打ち合わせについてご案内いたします。`
      : `お日にちが近づいてまいりましたので、${dayLabel}のお打ち合わせについてご連絡いたします。`;
    let body = `${greet}\n\n${intro}`;
    const block = detailBlock(location, meetingUrl, reminderTitle);
    if (block) body += `\n\n${block}`;
    body += `\n\n${dayLabel}はどうぞよろしくお願いいたします。${sig}`;
    return body;
  }
  if (tone === "casual") {
    let body = `${greet}\n\n${dayLabel}のお打ち合わせのリマインドです！`;
    const block = detailBlock(location, meetingUrl, reminderTitle);
    if (block) body += `\n\n${block}`;
    body += `\n\n${dayLabel}はよろしくお願いします！${sig}`;
    return body;
  }
  const title = reminderTitle?.trim() || "打ち合わせ";
  let body = `${dayLabel}の${title}のリマインドです！`;
  const lines: string[] = [];
  if (reminderTitle?.trim()) lines.push(`■件名：${reminderTitle.trim()}`);
  if (meeting?.date) lines.push(`■日付：${meeting.date}`);
  if (meeting?.time) lines.push(`■時間：${meeting.time}`);
  if (location?.trim()) lines.push(`■場所：${location.trim()}`);
  const url = meetingUrl?.trim() || meeting?.url;
  if (url) lines.push(`■URL：${url}`);
  if (lines.length > 0) body += `\n\n${lines.join("\n")}`;
  body += `\n\nよろしくね！${sig}`;
  return body;
}

function buildNext(opts: GenerateGreetingOptions): string {
  const { profile, tone, scheduleText, mtgTitle, location, meetingUrl, includeSignature = true } = opts;
  const company = profile.company ?? "";
  const name = profile.name;
  const greet = openingGreeting(tone, company, name);
  const sig = maybeSignature(profile, tone, includeSignature);

  const slotsBlock = scheduleText?.trim()
    ? scheduleText.trim()
    : "（日程候補を貼り付けてください）";

  // MTGタイトル・場所・URLブロック
  const titleLine = mtgTitle?.trim() ? `\n■件名：${mtgTitle.trim()}` : "";
  const locationLine = location?.trim() ? `\n■場所：${location.trim()}` : "";
  const urlLine = meetingUrl?.trim() ? `\n■URL：${meetingUrl.trim()}` : "";
  const detailBlock = (titleLine || locationLine || urlLine) ? `${titleLine}${locationLine}${urlLine}\n\n` : "";

  if (tone === "formal") {
    return `${greet}\n\n次回のお打ち合わせの日程につきまして、ご相談させていただきたくご連絡いたしました。\n\n${detailBlock}以下の日時でご都合のよろしい日はございますでしょうか。\nお手数ですが、ご確認いただけますと幸いです。\n\n${slotsBlock}\n\nご不明点やご要望などございましたら、お気軽にお申し付けくださいませ。\n${closing(tone)}${sig}`;
  }
  if (tone === "casual") {
    return `${greet}\n\n次回の打ち合わせ日程についてご連絡です！\n\n${detailBlock}以下の日程でご都合はいかがでしょうか？\n\n${slotsBlock}\n\nご確認よろしくお願いします！${sig}`;
  }
  return `次回の日程なんだけど、\nどれか行ける日あるかな？\n\n${detailBlock}${slotsBlock}\n\n確認よろしくお願いします！${sig}`;
}

function buildReply(opts: GenerateGreetingOptions): string {
  const {
    profile, tone,
    replyStyle = "kashikomarimashita",
    replySubtype = "confirmed",
    confirmedDate,
    newScheduleText,
    includeSignature = true,
  } = opts;
  const sig = maybeSignature(profile, tone, includeSignature);
  const ack = replyStyle === "shochishimashita" ? "承知いたしました。" : "かしこまりました。";
  const ackCasual = replyStyle === "shochishimashita" ? "承知しました！" : "了解しました！";

  // 日程確定
  if (replySubtype === "confirmed") {
    if (tone === "formal") {
      const dateBlock = confirmedDate?.trim() ? `\n\n${confirmedDate.trim()}にお話しできることを楽しみにしております。` : "";
      return `ご連絡ありがとうございます。\n${ack}${dateBlock}\n引き続きどうぞよろしくお願いいたします。${sig}`;
    }
    if (tone === "casual") {
      const dateBlock = confirmedDate?.trim() ? `\n${confirmedDate.trim()}を楽しみにしています！` : "";
      return `ご連絡ありがとうございます！\n${ackCasual}${dateBlock}\n引き続きよろしくお願いします！${sig}`;
    }
    const dateBlock = confirmedDate?.trim() ? `\n${confirmedDate.trim()}ね！` : "";
    return `了解〜！${dateBlock}\nよろしくね！${sig}`;
  }

  // 別候補を依頼
  if (replySubtype === "reschedule") {
    const slotsBlock = newScheduleText?.trim() ? `\n\n${newScheduleText.trim()}` : "";
    if (tone === "formal") {
      return `ご連絡ありがとうございます。\nあいにくご提示いただいた日程での調整が難しく、大変申し訳ございません。\n改めて以下の日程でご都合はいかがでしょうか。${slotsBlock}\n\nお手数をおかけいたしますが、ご確認いただけますと幸いです。\n${closing(tone)}${sig}`;
    }
    if (tone === "casual") {
      return `ご連絡ありがとうございます！\nあいにく日程が合わず申し訳ありません。\n改めて候補日程をお送りします！${slotsBlock}\n\nご確認よろしくお願いします！${sig}`;
    }
    return `日程合わなかった、ごめん！\n別の候補だとこれはどう？${slotsBlock}\n\n${closing(tone)}${sig}`;
  }

  // 断られた
  if (replySubtype === "declined") {
    if (tone === "formal") {
      return `ご連絡いただき、誠にありがとうございます。\nご丁寧にご返信くださり、重ねてお礼申し上げます。\nまたの機会にご一緒できますことを楽しみにしております。\n今後ともどうぞよろしくお願いいたします。${sig}`;
    }
    if (tone === "casual") {
      return `ご連絡ありがとうございます！\nご丁寧にご返信いただきありがとうございます。\nまたの機会にぜひよろしくお願いします！${sig}`;
    }
    return `返事ありがとう！\nまた機会があればよろしくね！${sig}`;
  }

  // 保留・検討中
  if (replySubtype === "pending") {
    if (tone === "formal") {
      return `ご連絡ありがとうございます。\nご検討いただき、誠にありがとうございます。\nお時間のある際にご連絡いただけますと幸いです。\n引き続きどうぞよろしくお願いいたします。${sig}`;
    }
    if (tone === "casual") {
      return `ご連絡ありがとうございます！\nご検討いただきありがとうございます。\nお時間のあるときにご連絡いただけると嬉しいです！${sig}`;
    }
    return `検討してくれてありがとう！\n決まったら連絡してね！${sig}`;
  }

  // こちらから辞退
  if (replySubtype === "self_decline") {
    if (tone === "formal") {
      return `ご連絡いただき、誠にありがとうございます。\n大変恐縮ではございますが、今回は弊社の都合により参加を見送らせていただきたく存じます。\nまたの機会にご一緒できますことを楽しみにしております。\n今後ともどうぞよろしくお願いいたします。${sig}`;
    }
    if (tone === "casual") {
      return `ご連絡ありがとうございます！\n申し訳ないのですが、今回は都合がつかず参加が難しい状況です。\nまたの機会にぜひよろしくお願いします！${sig}`;
    }
    return `ごめん、今回は参加できそうにないんだ。\nまた誘ってね！${sig}`;
  }

  // 日程変更の依頼
  if (replySubtype === "change_request") {
    const slotsBlock = newScheduleText?.trim() ? `\n\n${newScheduleText.trim()}` : "";
    if (tone === "formal") {
      return `ご連絡いただき、誠にありがとうございます。\n大変恐縮ではございますが、先日ご調整いただいた打ち合わせにつきまして、日程の変更をお願いできますでしょうか。${slotsBlock ? `\n\n以下の日程でご都合はいかがでしょうか。${slotsBlock}` : ""}\n\nお手数をおかけし申し訳ございません。\n${closing(tone)}${sig}`;
    }
    if (tone === "casual") {
      return `ご連絡ありがとうございます！\n申し訳ないのですが、日程の変更をお願いできますか？${slotsBlock ? `\n\n以下の日程でいかがでしょうか？${slotsBlock}` : ""}\n\nご確認よろしくお願いします！${sig}`;
    }
    return `ごめん、日程変更したくて。${slotsBlock ? `\n\n${slotsBlock}` : ""}\n\n${closing(tone)}${sig}`;
  }

  // fallback
  if (tone === "formal") {
    return `ご連絡ありがとうございます。\n${ack}\n${closing(tone)}${sig}`;
  }
  if (tone === "casual") {
    return `ご連絡ありがとうございます！\n${ackCasual}\n${closing(tone)}${sig}`;
  }
  return `了解〜！${sig}`;
}

// ─────────────────────────────────────────────
// メイン関数
// ─────────────────────────────────────────────

export function generateGreeting(opts: GenerateGreetingOptions): string {
  switch (opts.scene) {
    case "intro":    return buildIntro(opts);
    case "thanks":   return buildThanks(opts);
    case "reminder": return buildReminder(opts);
    case "next":     return buildNext(opts);
    case "reply":    return buildReply(opts);
    default:         return "";
  }
}
