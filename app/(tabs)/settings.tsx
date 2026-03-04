import React, { useState, useCallback, useEffect } from "react";
import {
  View,
  Text,
  ScrollView,
  Pressable,
  TextInput,
  StyleSheet,
  ActivityIndicator,
  Platform,
  Alert,
} from "react-native";
import * as Haptics from "expo-haptics";
import { ScreenContainer } from "@/components/screen-container";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { useColors } from "@/hooks/use-colors";
import { useAuthContext } from "@/lib/auth-context";
import { useRouter } from "expo-router";
import {
  checkGoogleConnection,
  startGoogleAuth,
  disconnectGoogle,
  fetchCalendars,
  saveSelectedCalendars,
  loadSelectedCalendars,
  type GoogleCalendar,
} from "@/lib/google-calendar";
import {
  loadExclusionSettings,
  saveExclusionSettings,
  type ExclusionSettings,
  type ExcludedTimeRange,
  DEFAULT_EXCLUSION,
} from "@/lib/exclusion-settings";

const WEEKDAY_LABELS = ["日", "月", "火", "水", "木", "金", "土"];
const HOUR_OPTIONS = Array.from({ length: 24 }, (_, i) => i);

function genId() {
  return Math.random().toString(36).slice(2, 10);
}

function formatHM(hour: number, min: number) {
  return `${String(hour).padStart(2, "0")}:${String(min).padStart(2, "0")}`;
}

export default function SettingsScreen() {
  const colors = useColors();
  const router = useRouter();
  const { user, isAuthenticated, loading: authLoading } = useAuthContext();

  const [googleConnected, setGoogleConnected] = useState(false);
  const [checkingGoogle, setCheckingGoogle] = useState(false);
  const [calendars, setCalendars] = useState<GoogleCalendar[]>([]);
  const [selectedCalendarIds, setSelectedCalendarIds] = useState<string[]>(["primary"]);
  const [loadingCalendars, setLoadingCalendars] = useState(false);

  // 除外設定
  const [exclusion, setExclusion] = useState<ExclusionSettings>(DEFAULT_EXCLUSION);
  const [showAddRange, setShowAddRange] = useState(false);
  const [newRangeStartH, setNewRangeStartH] = useState(12);
  const [newRangeStartM, setNewRangeStartM] = useState(0);
  const [newRangeEndH, setNewRangeEndH] = useState(13);
  const [newRangeEndM, setNewRangeEndM] = useState(0);
  const [newRangeLabel, setNewRangeLabel] = useState("");

  useEffect(() => {
    loadExclusionSettings().then(setExclusion);
  }, []);

  const updateExclusion = useCallback(async (next: ExclusionSettings) => {
    setExclusion(next);
    await saveExclusionSettings(next);
  }, []);

  const toggleWeekday = useCallback(async (day: number) => {
    if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const next = exclusion.excludedWeekdays.includes(day)
      ? exclusion.excludedWeekdays.filter((d) => d !== day)
      : [...exclusion.excludedWeekdays, day];
    await updateExclusion({ ...exclusion, excludedWeekdays: next });
  }, [exclusion, updateExclusion]);

  const addTimeRange = useCallback(async () => {
    if (newRangeStartH * 60 + newRangeStartM >= newRangeEndH * 60 + newRangeEndM) {
      Alert.alert("エラー", "終了時刻は開始時刻より後にしてください");
      return;
    }
    const range: ExcludedTimeRange = {
      id: genId(),
      startHour: newRangeStartH,
      startMin: newRangeStartM,
      endHour: newRangeEndH,
      endMin: newRangeEndM,
      label: newRangeLabel.trim() || undefined,
    };
    await updateExclusion({ ...exclusion, excludedTimeRanges: [...exclusion.excludedTimeRanges, range] });
    setShowAddRange(false);
    setNewRangeLabel("");
    if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  }, [exclusion, newRangeStartH, newRangeStartM, newRangeEndH, newRangeEndM, newRangeLabel, updateExclusion]);

  const removeTimeRange = useCallback(async (id: string) => {
    await updateExclusion({ ...exclusion, excludedTimeRanges: exclusion.excludedTimeRanges.filter((r) => r.id !== id) });
    if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
  }, [exclusion, updateExclusion]);

  const loadData = useCallback(async () => {
    if (!user) return;
    setCheckingGoogle(true);
    try {
      const connected = await checkGoogleConnection(String(user.id));
      setGoogleConnected(connected);
      if (connected) {
        setLoadingCalendars(true);
        const [cals, savedIds] = await Promise.all([
          fetchCalendars(String(user.id)),
          loadSelectedCalendars(String(user.id)),
        ]);
        setCalendars(cals);
        setSelectedCalendarIds(savedIds);
      }
    } catch (err) {
      console.error("Settings load error:", err);
    } finally {
      setCheckingGoogle(false);
      setLoadingCalendars(false);
    }
  }, [user]);

  useEffect(() => {
    if (isAuthenticated && user) loadData();
  }, [isAuthenticated, user, loadData]);

  useEffect(() => {
    if (Platform.OS === "web" && typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      if (params.get("googleConnected") === "true") {
        window.history.replaceState({}, "", window.location.pathname);
        loadData();
      }
    }
  }, [loadData]);

  const handleConnectGoogle = useCallback(async () => {
    if (!user) return;
    const success = await startGoogleAuth(String(user.id));
    if (success) await loadData();
  }, [user, loadData]);

  const handleDisconnectGoogle = useCallback(() => {
    if (!user) return;
    const doDisconnect = async () => {
      if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      await disconnectGoogle(String(user.id));
      setGoogleConnected(false);
      setCalendars([]);
    };
    if (Platform.OS === "web") {
      if (window.confirm("Googleカレンダーの連携を解除しますか？")) doDisconnect();
    } else {
      Alert.alert("連携解除", "Googleカレンダーの連携を解除しますか？", [
        { text: "キャンセル", style: "cancel" },
        { text: "解除する", style: "destructive", onPress: doDisconnect },
      ]);
    }
  }, [user]);

  const toggleCalendar = useCallback(async (calId: string) => {
    if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const next = selectedCalendarIds.includes(calId)
      ? selectedCalendarIds.filter((id) => id !== calId)
      : [...selectedCalendarIds, calId];
    setSelectedCalendarIds(next);
    await saveSelectedCalendars(next, user ? String(user.id) : undefined);
  }, [selectedCalendarIds, user]);

  const c = colors;

  if (authLoading) {
    return (
      <ScreenContainer>
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
          <ActivityIndicator size="large" color={c.primary} />
        </View>
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer containerClassName="bg-background">
      <ScrollView
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        bounces={true}
        alwaysBounceVertical={true}
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingBottom: 60 }}
      >
        {/* Header */}
        <View style={{ paddingHorizontal: 20, paddingTop: 16, paddingBottom: 12 }}>
          <Text style={{ fontSize: 18, fontWeight: "700", color: c.foreground }}>設定</Text>
        </View>

        {/* Account Section */}
        <Text style={st.sectionTitle(c)}>アカウント</Text>
        {!isAuthenticated ? (
          <View style={[st.card, { backgroundColor: c.surface, borderColor: c.border }]}>
            <Text style={{ fontSize: 14, color: c.muted, marginBottom: 14, textAlign: "center" }}>
              Googleカレンダーを使うにはログインが必要です
            </Text>
            <Pressable
              style={({ pressed }) => [{ backgroundColor: c.primary, paddingVertical: 14, borderRadius: 14, alignItems: "center" }, pressed && { opacity: 0.85 }]}
              onPress={() => router.push("/login" as any)}
            >
              <Text style={{ color: "#fff", fontWeight: "700", fontSize: 15 }}>ログイン</Text>
            </Pressable>
          </View>
        ) : (
          <View style={[st.card, { backgroundColor: c.surface, borderColor: c.border }]}>
            <View style={[st.row, { gap: 12 }]}>
              <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: c.tealLight, alignItems: "center", justifyContent: "center" }}>
                <IconSymbol name="person.fill" size={24} color={c.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 15, fontWeight: "600", color: c.foreground }}>{user?.name ?? "ユーザー"}</Text>
                <Text style={{ fontSize: 13, color: c.muted }}>{user?.email ?? ""}</Text>
              </View>
            </View>
          </View>
        )}

        {/* 除外設定セクション */}
        <Text style={st.sectionTitle(c)}>検索から除外する設定</Text>
        <View style={[st.card, { backgroundColor: c.surface, borderColor: c.border }]}>
          {/* 除外曜日 */}
          <Text style={{ fontSize: 13, fontWeight: "600", color: c.muted, marginBottom: 10 }}>除外する曜日</Text>
          <View style={{ flexDirection: "row", gap: 6, marginBottom: 16 }}>
            {WEEKDAY_LABELS.map((label, day) => {
              const isExcluded = exclusion.excludedWeekdays.includes(day);
              const isSunSat = day === 0 || day === 6;
              return (
                <Pressable
                  key={day}
                  style={({ pressed }) => [
                    { flex: 1, paddingVertical: 10, borderRadius: 10, alignItems: "center", borderWidth: 1.5 },
                    isExcluded
                      ? { backgroundColor: c.error, borderColor: c.error }
                      : isSunSat
                      ? { backgroundColor: c.background, borderColor: c.border }
                      : { backgroundColor: c.background, borderColor: c.border },
                    pressed && { opacity: 0.7 },
                  ]}
                  onPress={() => toggleWeekday(day)}
                >
                  <Text style={{
                    fontSize: 13,
                    fontWeight: "700",
                    color: isExcluded ? "#fff" : isSunSat ? c.error : c.foreground,
                  }}>
                    {label}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          {/* 除外時間帯 */}
          <View style={[st.row, { justifyContent: "space-between", marginBottom: 10 }]}>
            <Text style={{ fontSize: 13, fontWeight: "600", color: c.muted }}>除外する時間帯</Text>
            <Pressable
              style={({ pressed }) => [st.row, { gap: 4, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 10, backgroundColor: c.tealLight }, pressed && { opacity: 0.7 }]}
              onPress={() => setShowAddRange((v) => !v)}
            >
              <IconSymbol name={showAddRange ? "xmark" : "plus"} size={14} color={c.primary} />
              <Text style={{ fontSize: 12, color: c.primary, fontWeight: "600" }}>{showAddRange ? "キャンセル" : "追加"}</Text>
            </Pressable>
          </View>

          {exclusion.excludedTimeRanges.length === 0 && !showAddRange && (
            <Text style={{ fontSize: 13, color: c.muted, marginBottom: 4 }}>除外する時間帯はありません</Text>
          )}

          {exclusion.excludedTimeRanges.map((range) => (
            <View key={range.id} style={[st.row, { backgroundColor: c.background, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, marginBottom: 6, borderWidth: 1, borderColor: c.border }]}>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 14, fontWeight: "600", color: c.foreground }}>
                  {formatHM(range.startHour, range.startMin)} 〜 {formatHM(range.endHour, range.endMin)}
                </Text>
                {range.label && (
                  <Text style={{ fontSize: 12, color: c.muted, marginTop: 2 }}>{range.label}</Text>
                )}
              </View>
              <Pressable
                style={({ pressed }) => [{ padding: 6, borderRadius: 8, backgroundColor: c.tealLight }, pressed && { opacity: 0.7 }]}
                onPress={() => removeTimeRange(range.id)}
              >
                <IconSymbol name="trash" size={16} color={c.error} />
              </Pressable>
            </View>
          ))}

          {/* 時間帯追加フォーム */}
          {showAddRange && (
            <View style={{ backgroundColor: c.background, borderRadius: 12, padding: 12, borderWidth: 1, borderColor: c.primary, marginTop: 4 }}>
              <Text style={{ fontSize: 12, color: c.muted, marginBottom: 8 }}>ラベル（任意）</Text>
              <TextInput
                value={newRangeLabel}
                onChangeText={setNewRangeLabel}
                placeholder="例：ランチ、会議"
                placeholderTextColor={c.border}
                style={[st.input(c), { marginBottom: 12 }]}
                returnKeyType="done"
              />
              <View style={[st.row, { gap: 12, marginBottom: 12 }]}>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 12, color: c.muted, marginBottom: 6 }}>開始時刻</Text>
                  <View style={[st.row, { gap: 6 }]}>
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: 11, color: c.muted, marginBottom: 4, textAlign: "center" }}>時</Text>
                      <ScrollView style={{ height: 80, borderWidth: 1, borderColor: c.border, borderRadius: 8 }} showsVerticalScrollIndicator={false}>
                        {HOUR_OPTIONS.map((h) => (
                          <Pressable
                            key={h}
                            style={({ pressed }) => [{ paddingVertical: 6, alignItems: "center", borderRadius: 6 }, newRangeStartH === h && { backgroundColor: c.primary }, pressed && { opacity: 0.7 }]}
                            onPress={() => setNewRangeStartH(h)}
                          >
                            <Text style={{ fontSize: 13, color: newRangeStartH === h ? "#fff" : c.foreground, fontWeight: newRangeStartH === h ? "700" : "400" }}>{String(h).padStart(2, "0")}</Text>
                          </Pressable>
                        ))}
                      </ScrollView>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: 11, color: c.muted, marginBottom: 4, textAlign: "center" }}>分</Text>
                      {[0, 30].map((m) => (
                        <Pressable
                          key={m}
                          style={({ pressed }) => [{ paddingVertical: 8, alignItems: "center", borderRadius: 8, borderWidth: 1, marginBottom: 4 }, newRangeStartM === m ? { backgroundColor: c.primary, borderColor: c.primary } : { borderColor: c.border }, pressed && { opacity: 0.7 }]}
                          onPress={() => setNewRangeStartM(m)}
                        >
                          <Text style={{ fontSize: 13, color: newRangeStartM === m ? "#fff" : c.foreground, fontWeight: "600" }}>{String(m).padStart(2, "0")}</Text>
                        </Pressable>
                      ))}
                    </View>
                  </View>
                </View>
                <Text style={{ fontSize: 18, color: c.muted, alignSelf: "center", marginTop: 16 }}>〜</Text>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 12, color: c.muted, marginBottom: 6 }}>終了時刻</Text>
                  <View style={[st.row, { gap: 6 }]}>
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: 11, color: c.muted, marginBottom: 4, textAlign: "center" }}>時</Text>
                      <ScrollView style={{ height: 80, borderWidth: 1, borderColor: c.border, borderRadius: 8 }} showsVerticalScrollIndicator={false}>
                        {HOUR_OPTIONS.map((h) => (
                          <Pressable
                            key={h}
                            style={({ pressed }) => [{ paddingVertical: 6, alignItems: "center", borderRadius: 6 }, newRangeEndH === h && { backgroundColor: c.primary }, pressed && { opacity: 0.7 }]}
                            onPress={() => setNewRangeEndH(h)}
                          >
                            <Text style={{ fontSize: 13, color: newRangeEndH === h ? "#fff" : c.foreground, fontWeight: newRangeEndH === h ? "700" : "400" }}>{String(h).padStart(2, "0")}</Text>
                          </Pressable>
                        ))}
                      </ScrollView>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: 11, color: c.muted, marginBottom: 4, textAlign: "center" }}>分</Text>
                      {[0, 30].map((m) => (
                        <Pressable
                          key={m}
                          style={({ pressed }) => [{ paddingVertical: 8, alignItems: "center", borderRadius: 8, borderWidth: 1, marginBottom: 4 }, newRangeEndM === m ? { backgroundColor: c.primary, borderColor: c.primary } : { borderColor: c.border }, pressed && { opacity: 0.7 }]}
                          onPress={() => setNewRangeEndM(m)}
                        >
                          <Text style={{ fontSize: 13, color: newRangeEndM === m ? "#fff" : c.foreground, fontWeight: "600" }}>{String(m).padStart(2, "0")}</Text>
                        </Pressable>
                      ))}
                    </View>
                  </View>
                </View>
              </View>
              <Pressable
                style={({ pressed }) => [{ backgroundColor: c.primary, paddingVertical: 12, borderRadius: 12, alignItems: "center" }, pressed && { opacity: 0.85 }]}
                onPress={addTimeRange}
              >
                <Text style={{ color: "#fff", fontWeight: "700", fontSize: 14 }}>この時間帯を除外する</Text>
              </Pressable>
            </View>
          )}
        </View>

        {/* Google Calendar Section */}
        {isAuthenticated && (
          <>
            <Text style={st.sectionTitle(c)}>Googleカレンダー連携</Text>
            <View style={[st.card, { backgroundColor: c.surface, borderColor: c.border }]}>
              {checkingGoogle ? (
                <View style={{ alignItems: "center", paddingVertical: 16 }}>
                  <ActivityIndicator color={c.primary} />
                  <Text style={{ fontSize: 13, color: c.muted, marginTop: 8 }}>接続状況を確認中...</Text>
                </View>
              ) : googleConnected ? (
                <>
                  <View style={[st.row, { marginBottom: 14 }]}>
                    <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: c.success, marginRight: 8 }} />
                    <Text style={{ fontSize: 14, fontWeight: "600", color: c.success, flex: 1 }}>Googleカレンダーと連携済み</Text>
                    <Pressable
                      style={({ pressed }) => [{ paddingHorizontal: 12, paddingVertical: 6, borderRadius: 10, borderWidth: 1, borderColor: c.error }, pressed && { opacity: 0.7 }]}
                      onPress={handleDisconnectGoogle}
                    >
                      <Text style={{ fontSize: 12, color: c.error, fontWeight: "600" }}>解除</Text>
                    </Pressable>
                  </View>
                  <Text style={{ fontSize: 13, fontWeight: "600", color: c.muted, marginBottom: 10 }}>使用するカレンダー</Text>
                  {loadingCalendars ? (
                    <ActivityIndicator color={c.primary} style={{ marginVertical: 12 }} />
                  ) : calendars.length === 0 ? (
                    <Text style={{ fontSize: 13, color: c.muted }}>カレンダーが見つかりませんでした</Text>
                  ) : (
                    calendars.map((cal) => {
                      const isSelected = selectedCalendarIds.includes(cal.id);
                      return (
                        <Pressable
                          key={cal.id}
                          style={({ pressed }) => [
                            st.row,
                            { paddingVertical: 10, paddingHorizontal: 12, borderRadius: 12, marginBottom: 6, borderWidth: 1.5 },
                            isSelected ? { backgroundColor: c.tealLight, borderColor: c.primary } : { backgroundColor: c.background, borderColor: c.border },
                            pressed && { opacity: 0.8 },
                          ]}
                          onPress={() => toggleCalendar(cal.id)}
                        >
                          <View style={[{ width: 14, height: 14, borderRadius: 7, marginRight: 10 }, { backgroundColor: cal.backgroundColor ?? c.primary }]} />
                          <Text style={{ flex: 1, fontSize: 14, color: isSelected ? c.primary : c.foreground, fontWeight: isSelected ? "600" : "400" }}>
                            {cal.summary}{cal.primary ? " (メイン)" : ""}
                          </Text>
                          {isSelected && <IconSymbol name="checkmark.circle.fill" size={18} color={c.primary} />}
                        </Pressable>
                      );
                    })
                  )}
                </>
              ) : (
                <>
                  <Text style={{ fontSize: 14, color: c.muted, marginBottom: 14 }}>
                    Googleカレンダーを連携すると、空き時間を自動で検索できます
                  </Text>
                  <Pressable
                    style={({ pressed }) => [st.row, { justifyContent: "center", gap: 10, backgroundColor: c.primary, paddingVertical: 14, borderRadius: 14 }, pressed && { opacity: 0.85 }]}
                    onPress={handleConnectGoogle}
                  >
                    <IconSymbol name="link" size={20} color="#fff" />
                    <Text style={{ color: "#fff", fontWeight: "700", fontSize: 15 }}>Googleカレンダーを連携する</Text>
                  </Pressable>
                </>
              )}
            </View>
          </>
        )}

        {/* App Info */}
        <Text style={st.sectionTitle(c)}>アプリ情報</Text>
        <View style={[st.card, { backgroundColor: c.surface, borderColor: c.border }]}>
          {[
            { label: "バージョン", value: "1.0.0" },
            { label: "開発", value: "Schedule Assistant" },
          ].map((item, i) => (
            <View key={i} style={[st.row, { justifyContent: "space-between", paddingVertical: 8, borderBottomWidth: i === 0 ? 1 : 0, borderBottomColor: c.border }]}>
              <Text style={{ fontSize: 14, color: c.foreground }}>{item.label}</Text>
              <Text style={{ fontSize: 14, color: c.muted }}>{item.value}</Text>
            </View>
          ))}
        </View>
      </ScrollView>
    </ScreenContainer>
  );
}

const st = {
  row: { flexDirection: "row" as const, alignItems: "center" as const },
  card: { marginHorizontal: 16, marginBottom: 12, borderRadius: 18, padding: 16, borderWidth: 1 },
  sectionTitle: (c: any) => ({
    fontSize: 12,
    fontWeight: "700" as const,
    color: c.muted,
    textTransform: "uppercase" as const,
    letterSpacing: 0.8,
    marginHorizontal: 20,
    marginBottom: 8,
    marginTop: 8,
  }),
  input: (c: any) => ({
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: c.foreground,
    backgroundColor: c.background,
    borderColor: c.border,
  }),
};
