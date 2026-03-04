import AsyncStorage from "@react-native-async-storage/async-storage";

const EXCLUSION_KEY = "exclusion_settings";
const TEMPLATES_KEY = "message_templates";

// ---- 除外設定 ----

export interface ExcludedTimeRange {
  id: string;
  startHour: number;  // 0-23
  startMin: number;   // 0 or 30
  endHour: number;
  endMin: number;
  label?: string;     // 例: "ランチ"
}

export interface ExclusionSettings {
  excludedWeekdays: number[];       // 0=日, 1=月, ..., 6=土
  excludedTimeRanges: ExcludedTimeRange[];
}

export const DEFAULT_EXCLUSION: ExclusionSettings = {
  excludedWeekdays: [0, 6], // デフォルト: 土日除外
  excludedTimeRanges: [],
};

export async function loadExclusionSettings(): Promise<ExclusionSettings> {
  const raw = await AsyncStorage.getItem(EXCLUSION_KEY);
  if (!raw) return DEFAULT_EXCLUSION;
  try {
    return { ...DEFAULT_EXCLUSION, ...JSON.parse(raw) };
  } catch {
    return DEFAULT_EXCLUSION;
  }
}

export async function saveExclusionSettings(settings: ExclusionSettings): Promise<void> {
  await AsyncStorage.setItem(EXCLUSION_KEY, JSON.stringify(settings));
}

// ---- メッセージテンプレート ----

export interface MessageTemplate {
  id: string;
  name: string;
  format: "line" | "mail" | "plain";
  content: string;   // プレースホルダー付きテンプレート本文
  createdAt: string; // ISO string
}

export async function loadTemplates(): Promise<MessageTemplate[]> {
  const raw = await AsyncStorage.getItem(TEMPLATES_KEY);
  if (!raw) return [];
  try {
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

export async function saveTemplate(template: MessageTemplate): Promise<void> {
  const existing = await loadTemplates();
  const idx = existing.findIndex((t) => t.id === template.id);
  if (idx >= 0) {
    existing[idx] = template;
  } else {
    existing.unshift(template);
  }
  await AsyncStorage.setItem(TEMPLATES_KEY, JSON.stringify(existing));
}

export async function deleteTemplate(id: string): Promise<void> {
  const existing = await loadTemplates();
  const filtered = existing.filter((t) => t.id !== id);
  await AsyncStorage.setItem(TEMPLATES_KEY, JSON.stringify(filtered));
}
