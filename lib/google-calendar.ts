import { getApiBaseUrl } from "@/constants/oauth";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as WebBrowser from "expo-web-browser";
import { Platform } from "react-native";

const SELECTED_CALENDARS_KEY = "selected_calendar_ids";

function apiBase() {
  return getApiBaseUrl();
}

export interface GoogleCalendar {
  id: string;
  summary: string;
  backgroundColor?: string;
  primary?: boolean;
  selected?: boolean;
}

export interface GoogleEvent {
  id: string;
  summary?: string;
  start: { dateTime?: string; date?: string };
  end: { dateTime?: string; date?: string };
  status?: string;
  transparency?: string; // "transparent" = 空き時間として扱う
}

export interface FreeSlot {
  start: Date;
  end: Date;
  durationMinutes: number;
}

// ---- API calls ----

export async function checkGoogleConnection(userId: string): Promise<boolean> {
  try {
    const res = await fetch(`${apiBase()}/api/google/status?userId=${encodeURIComponent(userId)}`);
    const data = await res.json();
    return data.connected === true;
  } catch {
    return false;
  }
}

/**
 * Google OAuth認証を開始する
 *
 * - Web: サーバー側のOAuthフローを使用（window.location.hrefでリダイレクト）
 * - Native (Expo Go / standalone): expo-web-browserのopenAuthSessionAsyncを使用
 *   サーバー側コールバック後、アプリのディープリンクにリダイレクトされる
 *
 * @returns Promise<boolean> - 認証が成功したかどうか（native のみ有効）
 */
export async function startGoogleAuth(userId: string): Promise<boolean> {
  const base = apiBase();

  if (Platform.OS === "web") {
    // Web: サーバーサイドOAuthフロー（リダイレクト）
    // サーバーが直接リダイレクトするので、window.location.hrefで遷移
    window.location.href = `${base}/api/oauth/google/start?userId=${encodeURIComponent(userId)}`;
    return false; // リダイレクトするので戻り値は意味なし
  }

  // Native: expo-web-browserを使用してシステムブラウザで認証
  // コールバック後にアプリのディープリンクにリダイレクトされる
  //
  // 重要: Expo Goでは Linking.createURL が exp:// スキームを生成するが、
  // ManusのOAuthシステムは exp:// を許可していない。
  // 代わりにアプリのカスタムスキーム (manus*) を直接指定する。
  // スキームは app.config.ts の scheme 値と一致させる必要がある。
  const APP_SCHEME = "manus20260304040150";
  const appRedirectUri = `${APP_SCHEME}://google-callback`;
  console.log("[Google Auth] App redirect URI:", appRedirectUri);

  const startUrl = `${base}/api/oauth/google/start?userId=${encodeURIComponent(userId)}&appRedirect=${encodeURIComponent(appRedirectUri)}`;

  try {
    const result = await WebBrowser.openAuthSessionAsync(startUrl, appRedirectUri);
    console.log("[Google Auth] WebBrowser result:", result.type);

    if (result.type === "success") {
      // ディープリンクのURLからパラメータを解析
      const url = result.url;
      console.log("[Google Auth] Callback URL:", url);
      // カスタムスキームのURLは標準URLパーサーで解析できない場合があるので正規表現でパラメータを取得
      const match = url.match(/[?&]googleConnected=([^&]+)/);
      if (match && match[1] === "true") {
        return true;
      }
    }
    return false;
  } catch (err) {
    console.error("[Google Auth] openAuthSessionAsync error:", err);
    return false;
  }
}

export async function disconnectGoogle(userId: string): Promise<void> {
  await fetch(`${apiBase()}/api/google/disconnect`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ userId }),
  });
}

export async function fetchCalendars(userId: string): Promise<GoogleCalendar[]> {
  const res = await fetch(`${apiBase()}/api/google/calendars?userId=${encodeURIComponent(userId)}`);
  if (!res.ok) throw new Error("Failed to fetch calendars");
  const data = await res.json();
  return data.calendars ?? [];
}

export async function fetchEvents(
  userId: string,
  calendarIds: string[],
  timeMin: Date,
  timeMax: Date
): Promise<GoogleEvent[]> {
  const params = new URLSearchParams({
    userId,
    calendarIds: calendarIds.join(","),
    timeMin: timeMin.toISOString(),
    timeMax: timeMax.toISOString(),
  });
  const res = await fetch(`${apiBase()}/api/google/events?${params}`);
  if (!res.ok) throw new Error("Failed to fetch events");
  const data = await res.json();
  return data.events ?? [];
}

// ---- Selected calendars persistence ----

export async function saveSelectedCalendars(ids: string[]): Promise<void> {
  await AsyncStorage.setItem(SELECTED_CALENDARS_KEY, JSON.stringify(ids));
}

export async function loadSelectedCalendars(): Promise<string[]> {
  const raw = await AsyncStorage.getItem(SELECTED_CALENDARS_KEY);
  if (!raw) return ["primary"];
  try {
    return JSON.parse(raw);
  } catch {
    return ["primary"];
  }
}

// ---- Free slot calculation ----

export interface SearchSettings {
  timeMode: "business" | "custom" | "allday";
  businessStart: number; // hour, e.g. 9
  businessEnd: number;   // hour, e.g. 18
  customStart: number;
  customEnd: number;
  minDurationMinutes: number;
  requiredDurationMinutes: number;
  maxSlots: number; // 0 = unlimited
  startStepMinutes: 30 | 60; // 30 = 30分刻み（10:00, 10:30, 11:00...）, 60 = 正時のみ（10:00, 11:00...）
}

export function extractFreeSlots(
  dates: Date[],
  events: GoogleEvent[],
  settings: SearchSettings
): FreeSlot[] {
  const slots: FreeSlot[] = [];

  for (const date of dates) {
    const daySlots = extractFreeSlotsForDay(date, events, settings);
    slots.push(...daySlots);
    if (settings.maxSlots > 0 && slots.length >= settings.maxSlots) break;
  }

  if (settings.maxSlots > 0) return slots.slice(0, settings.maxSlots);
  return slots;
}

function extractFreeSlotsForDay(
  date: Date,
  events: GoogleEvent[],
  settings: SearchSettings
): FreeSlot[] {
  const dayStart = new Date(date);
  const dayEnd = new Date(date);

  // Set search window based on time mode
  if (settings.timeMode === "business") {
    dayStart.setHours(settings.businessStart, 0, 0, 0);
    dayEnd.setHours(settings.businessEnd, 0, 0, 0);
  } else if (settings.timeMode === "custom") {
    dayStart.setHours(settings.customStart, 0, 0, 0);
    dayEnd.setHours(settings.customEnd, 0, 0, 0);
  } else {
    dayStart.setHours(0, 0, 0, 0);
    dayEnd.setHours(23, 59, 0, 0);
  }

  // Filter events for this day
  const dayEvents = events
    .filter((ev) => {
      if (ev.status === "cancelled") return false;
      if (ev.transparency === "transparent") return false; // "空き時間"設定の予定は除外
      const evStart = ev.start.dateTime ? new Date(ev.start.dateTime) : null;
      const evEnd = ev.end.dateTime ? new Date(ev.end.dateTime) : null;
      if (!evStart || !evEnd) return false; // 終日予定はスキップ
      // Overlaps with day window
      return evStart < dayEnd && evEnd > dayStart;
    })
    .map((ev) => ({
      start: new Date(ev.start.dateTime!),
      end: new Date(ev.end.dateTime!),
    }))
    .sort((a, b) => a.start.getTime() - b.start.getTime());

  // Merge overlapping events
  const merged: { start: Date; end: Date }[] = [];
  for (const ev of dayEvents) {
    const clampedStart = ev.start < dayStart ? dayStart : ev.start;
    const clampedEnd = ev.end > dayEnd ? dayEnd : ev.end;
    if (clampedStart >= clampedEnd) continue;

    if (merged.length === 0 || clampedStart > merged[merged.length - 1].end) {
      merged.push({ start: clampedStart, end: clampedEnd });
    } else {
      merged[merged.length - 1].end = new Date(
        Math.max(merged[merged.length - 1].end.getTime(), clampedEnd.getTime())
      );
    }
  }

  // Find gaps
  const freeSlots: FreeSlot[] = [];
  let cursor = dayStart;

  for (const busy of merged) {
    if (busy.start > cursor) {
      const gapMinutes = (busy.start.getTime() - cursor.getTime()) / 60000;
      if (gapMinutes >= settings.minDurationMinutes) {
        // Split into required-duration chunks
        let slotStart = cursor;
        while (slotStart < busy.start) {
          const slotEnd = new Date(slotStart.getTime() + settings.requiredDurationMinutes * 60000);
          if (slotEnd <= busy.start) {
            freeSlots.push({
              start: new Date(slotStart),
              end: slotEnd,
              durationMinutes: settings.requiredDurationMinutes,
            });
          }
          slotStart = new Date(slotStart.getTime() + settings.startStepMinutes * 60000);
        }
      }
    }
    cursor = busy.end > cursor ? busy.end : cursor;
  }

  // After last event
  if (cursor < dayEnd) {
    const gapMinutes = (dayEnd.getTime() - cursor.getTime()) / 60000;
    if (gapMinutes >= settings.minDurationMinutes) {
      let slotStart = cursor;
      while (slotStart < dayEnd) {
        const slotEnd = new Date(slotStart.getTime() + settings.requiredDurationMinutes * 60000);
        if (slotEnd <= dayEnd) {
          freeSlots.push({
            start: new Date(slotStart),
            end: slotEnd,
            durationMinutes: settings.requiredDurationMinutes,
          });
        }
        slotStart = new Date(slotStart.getTime() + settings.startStepMinutes * 60000);
      }
    }
  }

  return freeSlots;
}
