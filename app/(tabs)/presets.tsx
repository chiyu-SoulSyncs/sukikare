import React, { useState, useCallback, useEffect } from "react";
import {
  View,
  Text,
  ScrollView,
  Pressable,
  TextInput,
  StyleSheet,
  Platform,
  Alert,
} from "react-native";
import * as Haptics from "expo-haptics";
import { ScreenContainer } from "@/components/screen-container";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { useColors } from "@/hooks/use-colors";
import { loadPresets, savePreset, deletePreset, createDefaultPreset, type Preset } from "@/lib/presets";
import type { SearchSettings } from "@/lib/google-calendar";

const TONE_LABELS = { formal: "ビジネス丁寧語", casual: "カジュアル", friendly: "タメ口" };
const FORMAT_LABELS = { bullet: "箇条書き", table: "表形式", prose: "文章" };
const TIME_LABELS = { business: "営業時間(9-18時)", custom: "時間外OK(〜21時)", allday: "終日" };

function durationLabel(min: number) {
  if (min < 60) return `${min}分`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m > 0 ? `${h}時間${m}分` : `${h}時間`;
}

export default function PresetsScreen() {
  const colors = useColors();
  const [presets, setPresets] = useState<Preset[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [editingPreset, setEditingPreset] = useState<Preset | null>(null);
  const [formName, setFormName] = useState("");

  const reload = useCallback(async () => {
    const list = await loadPresets();
    setPresets(list);
  }, []);

  useEffect(() => { reload(); }, [reload]);

  const handleAdd = useCallback(() => {
    const preset = createDefaultPreset("新しいプリセット");
    setEditingPreset(preset);
    setFormName(preset.name);
    setShowForm(true);
  }, []);

  const handleEdit = useCallback((preset: Preset) => {
    setEditingPreset({ ...preset });
    setFormName(preset.name);
    setShowForm(true);
  }, []);

  const handleSave = useCallback(async () => {
    if (!editingPreset || !formName.trim()) return;
    if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    await savePreset({ ...editingPreset, name: formName.trim() });
    setShowForm(false);
    setEditingPreset(null);
    await reload();
  }, [editingPreset, formName, reload]);

  const handleDelete = useCallback((id: string) => {
    const doDelete = async () => {
      if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      await deletePreset(id);
      await reload();
    };
    if (Platform.OS === "web") {
      if (window.confirm("このプリセットを削除しますか？")) doDelete();
    } else {
      Alert.alert("削除", "このプリセットを削除しますか？", [
        { text: "キャンセル", style: "cancel" },
        { text: "削除", style: "destructive", onPress: doDelete },
      ]);
    }
  }, [reload]);

  const updateSetting = useCallback(<K extends keyof SearchSettings>(key: K, value: SearchSettings[K]) => {
    setEditingPreset((prev) => prev ? { ...prev, settings: { ...prev.settings, [key]: value } } : prev);
  }, []);

  const c = colors;

  const DURATION_OPTIONS = [
    { label: "30分", value: 30 },
    { label: "1時間", value: 60 },
    { label: "1.5時間", value: 90 },
    { label: "2時間", value: 120 },
  ];

  const SLOT_COUNT_OPTIONS = [
    { label: "3件", value: 3 },
    { label: "5件", value: 5 },
    { label: "無制限", value: 0 },
  ];

  return (
    <ScreenContainer containerClassName="bg-background">
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 40 }}>

        {/* Header */}
        <View style={[st.row, { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 12, justifyContent: "space-between" }]}>
          <Text style={{ fontSize: 18, fontWeight: "700", color: c.foreground }}>プリセット</Text>
          <Pressable
            style={({ pressed }) => [st.row, { gap: 6, backgroundColor: c.primary, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20 }, pressed && { opacity: 0.8 }]}
            onPress={handleAdd}
          >
            <IconSymbol name="plus" size={16} color="#fff" />
            <Text style={{ color: "#fff", fontWeight: "700", fontSize: 13 }}>追加</Text>
          </Pressable>
        </View>

        {/* Preset List */}
        {presets.length === 0 && !showForm && (
          <View style={{ alignItems: "center", paddingVertical: 60 }}>
            <Text style={{ fontSize: 48, marginBottom: 12 }}>🔖</Text>
            <Text style={{ fontSize: 16, fontWeight: "600", color: c.foreground, marginBottom: 6 }}>プリセットがありません</Text>
            <Text style={{ fontSize: 14, color: c.muted, textAlign: "center", paddingHorizontal: 40 }}>
              よく使う設定を保存して、次回から素早く検索できます
            </Text>
          </View>
        )}

        {presets.map((preset) => (
          <View key={preset.id} style={[st.card, { backgroundColor: c.surface, borderColor: c.border }]}>
            <View style={[st.row, { justifyContent: "space-between", marginBottom: 10 }]}>
              <Text style={{ fontSize: 16, fontWeight: "700", color: c.foreground, flex: 1 }}>{preset.name}</Text>
              <View style={[st.row, { gap: 8 }]}>
                <Pressable
                  style={({ pressed }) => [{ padding: 6, borderRadius: 8, backgroundColor: c.tealLight }, pressed && { opacity: 0.7 }]}
                  onPress={() => handleEdit(preset)}
                >
                  <IconSymbol name="pencil" size={16} color={c.primary} />
                </Pressable>
                <Pressable
                  style={({ pressed }) => [{ padding: 6, borderRadius: 8, backgroundColor: "#FEE2E2" }, pressed && { opacity: 0.7 }]}
                  onPress={() => handleDelete(preset.id)}
                >
                  <IconSymbol name="trash" size={16} color={c.error} />
                </Pressable>
              </View>
            </View>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
              {[
                TIME_LABELS[preset.settings.timeMode],
                durationLabel(preset.settings.requiredDurationMinutes),
                preset.settings.maxSlots === 0 ? "無制限" : `${preset.settings.maxSlots}件`,
                TONE_LABELS[preset.toneLevel],
                FORMAT_LABELS[preset.messageFormat],
              ].map((tag, i) => (
                <View key={i} style={{ backgroundColor: c.tealLight, borderRadius: 20, paddingHorizontal: 10, paddingVertical: 4 }}>
                  <Text style={{ fontSize: 12, color: c.primary, fontWeight: "600" }}>{tag}</Text>
                </View>
              ))}
            </View>
          </View>
        ))}

        {/* Preset Form */}
        {showForm && editingPreset && (
          <View style={[st.card, { backgroundColor: c.surface, borderColor: c.primary, borderWidth: 2 }]}>
            <Text style={{ fontSize: 15, fontWeight: "700", color: c.foreground, marginBottom: 14 }}>
              {presets.find((p) => p.id === editingPreset.id) ? "プリセットを編集" : "新しいプリセット"}
            </Text>

            <Text style={{ fontSize: 12, color: c.muted, marginBottom: 4 }}>プリセット名</Text>
            <TextInput
              value={formName}
              onChangeText={setFormName}
              placeholder="例：週次ミーティング用"
              placeholderTextColor={c.border}
              style={[st.input, { color: c.foreground, backgroundColor: c.background, borderColor: c.border }]}
              returnKeyType="done"
            />

            <Text style={{ fontSize: 12, color: c.muted, marginTop: 14, marginBottom: 8 }}>時間帯</Text>
            <View style={{ flexDirection: "row", gap: 8 }}>
              {(["business", "custom", "allday"] as const).map((mode) => (
                <Pressable
                  key={mode}
                  style={({ pressed }) => [{ flex: 1, paddingVertical: 8, borderRadius: 10, borderWidth: 1.5, alignItems: "center" }, editingPreset.settings.timeMode === mode ? { backgroundColor: c.primary, borderColor: c.primary } : { backgroundColor: c.background, borderColor: c.border }, pressed && { opacity: 0.8 }]}
                  onPress={() => updateSetting("timeMode", mode)}
                >
                  <Text style={{ fontSize: 11, fontWeight: "600", color: editingPreset.settings.timeMode === mode ? "#fff" : c.muted, textAlign: "center" }}>
                    {TIME_LABELS[mode]}
                  </Text>
                </Pressable>
              ))}
            </View>

            <Text style={{ fontSize: 12, color: c.muted, marginTop: 14, marginBottom: 8 }}>所要時間</Text>
            <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap" }}>
              {DURATION_OPTIONS.map((opt) => (
                <Pressable
                  key={opt.value}
                  style={({ pressed }) => [{ paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, borderWidth: 1.5 }, editingPreset.settings.requiredDurationMinutes === opt.value ? { backgroundColor: c.primary, borderColor: c.primary } : { backgroundColor: c.background, borderColor: c.border }, pressed && { opacity: 0.8 }]}
                  onPress={() => updateSetting("requiredDurationMinutes", opt.value)}
                >
                  <Text style={{ fontSize: 13, fontWeight: "600", color: editingPreset.settings.requiredDurationMinutes === opt.value ? "#fff" : c.muted }}>{opt.label}</Text>
                </Pressable>
              ))}
            </View>

            <Text style={{ fontSize: 12, color: c.muted, marginTop: 14, marginBottom: 8 }}>候補件数</Text>
            <View style={{ flexDirection: "row", gap: 8 }}>
              {SLOT_COUNT_OPTIONS.map((opt) => (
                <Pressable
                  key={opt.value}
                  style={({ pressed }) => [{ paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, borderWidth: 1.5 }, editingPreset.settings.maxSlots === opt.value ? { backgroundColor: c.primary, borderColor: c.primary } : { backgroundColor: c.background, borderColor: c.border }, pressed && { opacity: 0.8 }]}
                  onPress={() => updateSetting("maxSlots", opt.value)}
                >
                  <Text style={{ fontSize: 13, fontWeight: "600", color: editingPreset.settings.maxSlots === opt.value ? "#fff" : c.muted }}>{opt.label}</Text>
                </Pressable>
              ))}
            </View>

            <Text style={{ fontSize: 12, color: c.muted, marginTop: 14, marginBottom: 8 }}>敬語レベル</Text>
            <View style={{ flexDirection: "row", gap: 8 }}>
              {(["formal", "casual", "friendly"] as const).map((t) => (
                <Pressable
                  key={t}
                  style={({ pressed }) => [{ flex: 1, paddingVertical: 8, borderRadius: 10, borderWidth: 1.5, alignItems: "center" }, editingPreset.toneLevel === t ? { backgroundColor: c.primary, borderColor: c.primary } : { backgroundColor: c.background, borderColor: c.border }, pressed && { opacity: 0.8 }]}
                  onPress={() => setEditingPreset((p) => p ? { ...p, toneLevel: t } : p)}
                >
                  <Text style={{ fontSize: 11, fontWeight: "600", color: editingPreset.toneLevel === t ? "#fff" : c.muted }}>{TONE_LABELS[t]}</Text>
                </Pressable>
              ))}
            </View>

            <Text style={{ fontSize: 12, color: c.muted, marginTop: 14, marginBottom: 8 }}>フォーマット</Text>
            <View style={{ flexDirection: "row", gap: 8 }}>
              {(["bullet", "table", "prose"] as const).map((f) => (
                <Pressable
                  key={f}
                  style={({ pressed }) => [{ flex: 1, paddingVertical: 8, borderRadius: 10, borderWidth: 1.5, alignItems: "center" }, editingPreset.messageFormat === f ? { backgroundColor: c.primary, borderColor: c.primary } : { backgroundColor: c.background, borderColor: c.border }, pressed && { opacity: 0.8 }]}
                  onPress={() => setEditingPreset((p) => p ? { ...p, messageFormat: f } : p)}
                >
                  <Text style={{ fontSize: 11, fontWeight: "600", color: editingPreset.messageFormat === f ? "#fff" : c.muted }}>{FORMAT_LABELS[f]}</Text>
                </Pressable>
              ))}
            </View>

            <View style={[st.row, { gap: 10, marginTop: 20 }]}>
              <Pressable
                style={({ pressed }) => [{ flex: 1, paddingVertical: 12, borderRadius: 12, borderWidth: 1.5, borderColor: c.border, alignItems: "center" }, pressed && { opacity: 0.7 }]}
                onPress={() => { setShowForm(false); setEditingPreset(null); }}
              >
                <Text style={{ fontSize: 14, fontWeight: "600", color: c.muted }}>キャンセル</Text>
              </Pressable>
              <Pressable
                style={({ pressed }) => [{ flex: 2, paddingVertical: 12, borderRadius: 12, backgroundColor: c.primary, alignItems: "center" }, pressed && { opacity: 0.85 }]}
                onPress={handleSave}
              >
                <Text style={{ fontSize: 14, fontWeight: "700", color: "#fff" }}>保存する</Text>
              </Pressable>
            </View>
          </View>
        )}

      </ScrollView>
    </ScreenContainer>
  );
}

const st = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center" },
  card: { marginHorizontal: 16, marginBottom: 12, borderRadius: 18, padding: 16, borderWidth: 1 },
  input: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
  },
});
