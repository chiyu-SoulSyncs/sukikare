import AsyncStorage from "@react-native-async-storage/async-storage";
import type { SearchSettings } from "./google-calendar";

const PRESETS_KEY = "schedule_presets";

export interface Preset {
  id: string;
  name: string;
  settings: SearchSettings;
  toneLevel: "formal" | "casual" | "friendly";
  messageFormat: "bullet" | "table" | "prose";
  maxCandidates: number;
  createdAt: number;
}

export async function loadPresets(): Promise<Preset[]> {
  try {
    const raw = await AsyncStorage.getItem(PRESETS_KEY);
    if (!raw) return [];
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

export async function savePreset(preset: Preset): Promise<void> {
  const presets = await loadPresets();
  const idx = presets.findIndex((p) => p.id === preset.id);
  if (idx >= 0) {
    presets[idx] = preset;
  } else {
    presets.push(preset);
  }
  await AsyncStorage.setItem(PRESETS_KEY, JSON.stringify(presets));
}

export async function deletePreset(id: string): Promise<void> {
  const presets = await loadPresets();
  const filtered = presets.filter((p) => p.id !== id);
  await AsyncStorage.setItem(PRESETS_KEY, JSON.stringify(filtered));
}

export function createDefaultPreset(name: string): Preset {
  return {
    id: `preset_${Date.now()}`,
    name,
    settings: {
      timeMode: "business",
      businessStart: 9,
      businessEnd: 18,
      customStart: 9,
      customEnd: 21,
      minDurationMinutes: 60,
      requiredDurationMinutes: 60,
      maxSlots: 5,
      startStepMinutes: 30,
    },
    toneLevel: "formal",
    messageFormat: "bullet",
    maxCandidates: 5,
    createdAt: Date.now(),
  };
}
