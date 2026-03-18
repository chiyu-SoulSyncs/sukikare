import React, { useState, useCallback, useEffect } from "react";
import {
  View,
  Text,
  ScrollView,
  Pressable,
  ActivityIndicator,
  StyleSheet,
  Platform,
} from "react-native";
import { useRouter } from "expo-router";
import * as Haptics from "expo-haptics";
import { ScreenContainer } from "@/components/screen-container";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { useColors } from "@/hooks/use-colors";
import { useAuthContext } from "@/lib/auth-context";
import {
  checkGoogleConnection,
  startGoogleAuth,
  fetchEvents,
  extractFreeSlots,
  loadSelectedCalendars,
  type SearchSettings,
} from "@/lib/google-calendar";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { loadExclusionSettings } from "@/lib/exclusion-settings";

const WEEKDAYS = ["日", "月", "火", "水", "木", "金", "土"];

function formatDateLabel(date: Date) {
  const m = date.getMonth() + 1;
  const d = date.getDate();
  const w = WEEKDAYS[date.getDay()];
  return `${m}/${d}(${w})`;
}

function isSameDay(a: Date, b: Date) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function addDays(date: Date, n: number) {
  const d = new Date(date);
  d.setDate(d.getDate() + n);
  return d;
}

function startOfWeek(date: Date) {
  const d = new Date(date);
  d.setDate(d.getDate() - d.getDay());
  d.setHours(0, 0, 0, 0);
  return d;
}

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

const TIME_MODE_OPTIONS: { label: string; value: SearchSettings["timeMode"] }[] = [
  { label: "営業時間\n(9-18時)", value: "business" },
  { label: "時間外OK\n(〜21時)", value: "custom" },
  { label: "終日", value: "allday" },
];

export default function HomeScreen() {
  const colors = useColors();
  const router = useRouter();
  const { user, isAuthenticated, loading: authLoading } = useAuthContext();

  const [searchMode, setSearchMode] = useState<"date" | "week">("date");
  const [selectedDates, setSelectedDates] = useState<Date[]>([]);
  const [weekOffset, setWeekOffset] = useState(0);
  const [selectedWeekDays, setSelectedWeekDays] = useState<number[]>([1, 2, 3, 4, 5]);
  const [showSettings, setShowSettings] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const [googleConnected, setGoogleConnected] = useState(false);
  const [checkingGoogle, setCheckingGoogle] = useState(false);

  const DEFAULT_SETTINGS: SearchSettings = {
    timeMode: "business",
    businessStart: 9,
    businessEnd: 18,
    customStart: 9,
    customEnd: 21,
    minDurationMinutes: 60,
    requiredDurationMinutes: 60,
    maxSlots: 5,
    startStepMinutes: 30,
  };

  const [settings, setSettings] = useState<SearchSettings>(DEFAULT_SETTINGS);

  // 設定の自動引き継ぎ: 起動時にAsyncStorageから設定を復元
  useEffect(() => {
    AsyncStorage.getItem("last_search_settings").then((raw) => {
      if (raw) {
        try {
          const saved = JSON.parse(raw) as Partial<SearchSettings>;
          setSettings((prev) => ({ ...prev, ...saved }));
        } catch {}
      }
    });
  }, []);

  useEffect(() => {
    if (isAuthenticated && user) {
      setCheckingGoogle(true);
      checkGoogleConnection()
        .then(setGoogleConnected)
        .finally(() => setCheckingGoogle(false));
    }
  }, [isAuthenticated, user]);

  useEffect(() => {
    if (Platform.OS === "web" && typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      if (params.get("googleConnected") === "true") {
        setGoogleConnected(true);
        window.history.replaceState({}, "", window.location.pathname);
      }
    }
  }, []);

  const toggleDate = useCallback((date: Date) => {
    if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setSelectedDates((prev) => {
      const exists = prev.some((d) => isSameDay(d, date));
      if (exists) return prev.filter((d) => !isSameDay(d, date));
      return [...prev, date].sort((a, b) => a.getTime() - b.getTime());
    });
  }, []);

  const toggleWeekDay = useCallback((dayIndex: number) => {
    if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setSelectedWeekDays((prev) =>
      prev.includes(dayIndex) ? prev.filter((d) => d !== dayIndex) : [...prev, dayIndex]
    );
  }, []);

  const handleConnectGoogle = useCallback(async () => {
    if (!user) { router.push("/login" as any); return; }
    const success = await startGoogleAuth(Platform.OS !== "web" ? String(user.id) : undefined);
    if (success) {
      setGoogleConnected(true);
    }
  }, [user, router]);

  // 設定変更時にAsyncStorageに保存
  const updateSettings = useCallback((patch: Partial<SearchSettings>) => {
    setSettings((prev) => {
      const next = { ...prev, ...patch };
      AsyncStorage.setItem("last_search_settings", JSON.stringify(next)).catch(() => {});
      return next;
    });
  }, []);

  // クイック検索: 日付・時間帯を自動セットして即検索
  const handleQuickSearch = useCallback(async (type: "this_week_am" | "this_week_pm" | "next_week_am" | "next_week_pm" | "this_week_all" | "next_week_all") => {
    if (!user) { router.push("/login" as any); return; }
    if (!googleConnected) { await handleConnectGoogle(); return; }

    const now = new Date();
    const offset = type.startsWith("next") ? 1 : 0;
    const ws = startOfWeek(addDays(now, offset * 7));
    const weekDatesForSearch: Date[] = [];
    for (let i = 1; i <= 5; i++) { // 月山のみ
      const d = addDays(ws, i);
      if (d >= now) weekDatesForSearch.push(d);
    }
    if (weekDatesForSearch.length === 0) return;

    const timeMode: SearchSettings["timeMode"] = type.includes("all") ? "business" : "custom";
    const quickSettings: SearchSettings = {
      ...settings,
      timeMode,
      customStart: type.includes("am") ? 9 : type.includes("pm") ? 13 : 9,
      customEnd: type.includes("am") ? 12 : type.includes("pm") ? 18 : 18,
      businessStart: 9,
      businessEnd: 18,
    };

    setIsSearching(true);
    if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    try {
      const [calendarIds, exclusion] = await Promise.all([
        loadSelectedCalendars(String(user.id)),
        loadExclusionSettings(),
      ]);
      const timeMin = new Date(weekDatesForSearch[0]); timeMin.setHours(0, 0, 0, 0);
      const timeMax = new Date(weekDatesForSearch[weekDatesForSearch.length - 1]); timeMax.setHours(23, 59, 59, 999);
      const events = await fetchEvents(calendarIds, timeMin, timeMax);
      const slots = extractFreeSlots(weekDatesForSearch, events, { ...quickSettings, excludedWeekdays: exclusion.excludedWeekdays, excludedTimeRanges: exclusion.excludedTimeRanges });
      await AsyncStorage.setItem("search_results", JSON.stringify({
        slots: slots.map((s) => ({ start: s.start.toISOString(), end: s.end.toISOString(), durationMinutes: s.durationMinutes })),
        settings: quickSettings,
      }));
      if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      router.push("/result" as any);
    } catch (err) {
      console.error("Quick search failed:", err);
      if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      setIsSearching(false);
    }
  }, [user, googleConnected, settings, router, handleConnectGoogle]);

  const handleSearch = useCallback(async () => {
    if (!user) { router.push("/login" as any); return; }
    if (!googleConnected) { await handleConnectGoogle(); return; }

    const datesToSearch: Date[] = [];
    if (searchMode === "date") {
      datesToSearch.push(...selectedDates);
    } else {
      const weekStart = startOfWeek(addDays(new Date(), weekOffset * 7));
      for (let i = 0; i < 7; i++) {
        const d = addDays(weekStart, i);
        if (selectedWeekDays.includes(d.getDay())) datesToSearch.push(d);
      }
    }
    if (datesToSearch.length === 0) return;

    setIsSearching(true);
    if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    try {
      const [calendarIds, exclusion] = await Promise.all([
        loadSelectedCalendars(String(user.id)),
        loadExclusionSettings(),
      ]);
      const timeMin = new Date(datesToSearch[0]);
      timeMin.setHours(0, 0, 0, 0);
      const timeMax = new Date(datesToSearch[datesToSearch.length - 1]);
      timeMax.setHours(23, 59, 59, 999);

      const events = await fetchEvents(calendarIds, timeMin, timeMax);
      const slots = extractFreeSlots(datesToSearch, events, { ...settings, excludedWeekdays: exclusion.excludedWeekdays, excludedTimeRanges: exclusion.excludedTimeRanges });

      await AsyncStorage.setItem(
        "search_results",
        JSON.stringify({
          slots: slots.map((s) => ({
            start: s.start.toISOString(),
            end: s.end.toISOString(),
            durationMinutes: s.durationMinutes,
          })),
          settings,
        })
      );

      if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      router.push("/result" as any);
    } catch (err) {
      console.error("Search failed:", err);
      if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      setIsSearching(false);
    }
  }, [user, googleConnected, searchMode, selectedDates, weekOffset, selectedWeekDays, settings, router, handleConnectGoogle]);

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const weekStart = startOfWeek(addDays(new Date(), weekOffset * 7));
  const weekDates = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));

  // Calendar grid (current month, 6 weeks)
  const calStart = new Date(today.getFullYear(), today.getMonth(), 1);
  const firstDow = calStart.getDay();
  const calDays: Date[] = [];
  for (let i = 0; i < firstDow; i++) calDays.push(addDays(calStart, i - firstDow));
  for (let i = 0; i < 42 - firstDow; i++) calDays.push(addDays(calStart, i));

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
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 32 }}>

        {/* Header */}
        <View style={[st.row, { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 12 }]}>
          <Text style={{ fontSize: 18, fontWeight: "700", color: c.foreground, flex: 1 }}>
            スキカレ
          </Text>
          {!isAuthenticated ? (
            <Pressable
              style={({ pressed }) => [{ backgroundColor: c.primary, paddingHorizontal: 16, paddingVertical: 7, borderRadius: 20 }, pressed && { opacity: 0.7 }]}
              onPress={() => router.push("/login" as any)}
            >
              <Text style={{ color: "#fff", fontWeight: "600", fontSize: 13 }}>ログイン</Text>
            </Pressable>
          ) : (
            <View style={[st.row, { gap: 6 }]}>
              <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: googleConnected ? c.success : c.muted }} />
              <Text style={{ fontSize: 12, color: c.muted }}>
                {checkingGoogle ? "確認中..." : googleConnected ? "Google連携済" : "未連携"}
              </Text>
            </View>
          )}
        </View>

        {/* Google Connect Banner */}
        {isAuthenticated && !googleConnected && !checkingGoogle && (
          <Pressable
            style={({ pressed }) => [st.row, { backgroundColor: c.primary, marginHorizontal: 16, marginBottom: 12, borderRadius: 14, padding: 14, gap: 10 }, pressed && { opacity: 0.85 }]}
            onPress={handleConnectGoogle}
          >
            <IconSymbol name="link" size={20} color="#fff" />
            <Text style={{ flex: 1, color: "#fff", fontWeight: "600", fontSize: 14 }}>Googleカレンダーを連携する</Text>
            <IconSymbol name="chevron.right" size={18} color="#fff" />
          </Pressable>
        )}

        {/* Quick Search Buttons */}
        {isAuthenticated && googleConnected && (
          <View style={{ marginHorizontal: 16, marginBottom: 14 }}>
            <Text style={{ fontSize: 12, fontWeight: "600", color: c.muted, marginBottom: 8 }}>クイック検索</Text>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
              {([
                { label: "今週午前", type: "this_week_am" as const },
                { label: "今週午後", type: "this_week_pm" as const },
                { label: "来週午前", type: "next_week_am" as const },
                { label: "来週午後", type: "next_week_pm" as const },
                { label: "今週一週間", type: "this_week_all" as const },
                { label: "来週一週間", type: "next_week_all" as const },
              ]).map(({ label, type }) => (
                <Pressable
                  key={type}
                  style={({ pressed }) => [{
                    backgroundColor: c.surface,
                    borderWidth: 1,
                    borderColor: c.border,
                    borderRadius: 20,
                    paddingHorizontal: 14,
                    paddingVertical: 7,
                  }, pressed && { opacity: 0.7, backgroundColor: c.primary + "22" }]}
                  onPress={() => !isSearching && handleQuickSearch(type)}
                  disabled={isSearching}
                >
                  <Text style={{ fontSize: 13, fontWeight: "600", color: c.foreground }}>{label}</Text>
                </Pressable>
              ))}
            </View>
          </View>
        )}

        {/* Mode Selector */}
        <View style={{ flexDirection: "row", marginHorizontal: 16, marginBottom: 12, backgroundColor: c.surface, borderRadius: 12, padding: 4, borderWidth: 1, borderColor: c.border }}>
          {(["date", "week"] as const).map((mode) => (
            <Pressable
              key={mode}
              style={({ pressed }) => [{ flex: 1, paddingVertical: 8, borderRadius: 10, alignItems: "center" }, searchMode === mode && { backgroundColor: c.primary }, pressed && { opacity: 0.8 }]}
              onPress={() => setSearchMode(mode)}
            >
              <Text style={{ fontSize: 14, fontWeight: "600", color: searchMode === mode ? "#fff" : c.muted }}>
                {mode === "date" ? "日付指定" : "週指定"}
              </Text>
            </Pressable>
          ))}
        </View>

        {/* Date Mode: Calendar */}
        {searchMode === "date" && (
          <View style={[st.card, { backgroundColor: c.surface, borderColor: c.border }]}>
            <Text style={{ fontSize: 14, fontWeight: "600", color: c.muted, marginBottom: 12 }}>日付を選択（複数可）</Text>
            <View style={{ flexDirection: "row", marginBottom: 6 }}>
              {["日", "月", "火", "水", "木", "金", "土"].map((d, i) => (
                <Text key={d} style={{ flex: 1, textAlign: "center", fontSize: 12, fontWeight: "600", color: i === 0 ? c.error : i === 6 ? c.primary : c.muted }}>{d}</Text>
              ))}
            </View>
            <View style={{ flexDirection: "row", flexWrap: "wrap" }}>
              {calDays.map((date, idx) => {
                const isSelected = selectedDates.some((d) => isSameDay(d, date));
                const isToday = isSameDay(date, new Date());
                const isPast = date < today;
                const isCurrentMonth = date.getMonth() === today.getMonth();
                return (
                  <Pressable
                    key={idx}
                    style={({ pressed }) => [
                      { width: "14.28%", aspectRatio: 1, alignItems: "center", justifyContent: "center", borderRadius: 100 },
                      isSelected && { backgroundColor: c.primary },
                      pressed && !isPast && { opacity: 0.7 },
                    ]}
                    onPress={() => !isPast && toggleDate(date)}
                    disabled={isPast}
                  >
                    {isToday && !isSelected && (
                      <View style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, borderRadius: 100, borderWidth: 2, borderColor: c.primary }} pointerEvents="none" />
                    )}
                    <Text style={{ fontSize: 14, fontWeight: isSelected ? "700" : "500", color: isSelected ? "#fff" : isPast || !isCurrentMonth ? c.border : c.foreground }}>
                      {date.getDate()}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
            {selectedDates.length > 0 && (
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 12 }}>
                {selectedDates.map((d, i) => (
                  <View key={i} style={[st.row, { backgroundColor: c.tealLight, borderRadius: 20, paddingHorizontal: 10, paddingVertical: 5, gap: 4 }]}>
                    <Text style={{ fontSize: 12, color: c.primary, fontWeight: "600" }}>{formatDateLabel(d)}</Text>
                    <Pressable onPress={() => toggleDate(d)}>
                      <IconSymbol name="xmark" size={12} color={c.primary} />
                    </Pressable>
                  </View>
                ))}
              </View>
            )}
          </View>
        )}

        {/* Week Mode */}
        {searchMode === "week" && (
          <View style={[st.card, { backgroundColor: c.surface, borderColor: c.border }]}>
            <View style={[st.row, { justifyContent: "space-between", marginBottom: 12 }]}>
              <Pressable style={({ pressed }) => [{ padding: 8, borderRadius: 10, backgroundColor: c.tealLight }, pressed && { opacity: 0.7 }]} onPress={() => setWeekOffset((w) => w - 1)}>
                <IconSymbol name="chevron.left" size={20} color={c.primary} />
              </Pressable>
              <Text style={{ fontSize: 14, fontWeight: "600", color: c.foreground }}>
                {formatDateLabel(weekStart)} 〜 {formatDateLabel(addDays(weekStart, 6))}
              </Text>
              <Pressable style={({ pressed }) => [{ padding: 8, borderRadius: 10, backgroundColor: c.tealLight }, pressed && { opacity: 0.7 }]} onPress={() => setWeekOffset((w) => w + 1)}>
                <IconSymbol name="chevron.right" size={20} color={c.primary} />
              </Pressable>
            </View>
            <View style={{ flexDirection: "row", gap: 6 }}>
              {weekDates.map((date, i) => {
                const isSelected = selectedWeekDays.includes(date.getDay());
                const isPast = date < today;
                return (
                  <Pressable
                    key={i}
                    style={({ pressed }) => [
                      { flex: 1, alignItems: "center", paddingVertical: 10, borderRadius: 12, backgroundColor: c.background, borderWidth: 1, borderColor: c.border },
                      isSelected && { backgroundColor: c.primary, borderColor: c.primary },
                      isPast && { opacity: 0.4 },
                      pressed && !isPast && { opacity: 0.7 },
                    ]}
                    onPress={() => !isPast && toggleWeekDay(date.getDay())}
                    disabled={isPast}
                  >
                    <Text style={{ fontSize: 12, fontWeight: "600", color: isSelected ? "#fff" : c.muted }}>{WEEKDAYS[date.getDay()]}</Text>
                    <Text style={{ fontSize: 16, fontWeight: "700", color: isSelected ? "#fff" : c.foreground, marginTop: 2 }}>{date.getDate()}</Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
        )}

        {/* Settings Toggle */}
        <Pressable
          style={({ pressed }) => [st.row, { marginHorizontal: 16, marginBottom: 8, gap: 8, paddingVertical: 6 }, pressed && { opacity: 0.8 }]}
          onPress={() => setShowSettings((v) => !v)}
        >
          <IconSymbol name="slider.horizontal.3" size={18} color={c.primary} />
          <Text style={{ flex: 1, fontSize: 14, fontWeight: "600", color: c.foreground }}>検索設定</Text>
          <IconSymbol name={showSettings ? "chevron.up" : "chevron.down"} size={18} color={c.muted} />
        </Pressable>

        {showSettings && (
          <View style={[st.card, { backgroundColor: c.surface, borderColor: c.border }]}>
            <Text style={{ fontSize: 13, fontWeight: "600", color: c.muted, marginBottom: 8 }}>時間帯</Text>
            <View style={{ flexDirection: "row", gap: 8 }}>
              {TIME_MODE_OPTIONS.map((opt) => (
                <Pressable
                  key={opt.value}
                  style={({ pressed }) => [{ flex: 1, paddingHorizontal: 8, paddingVertical: 10, borderRadius: 12, backgroundColor: c.background, borderWidth: 1, borderColor: c.border, alignItems: "center" }, settings.timeMode === opt.value && { backgroundColor: c.primary, borderColor: c.primary }, pressed && { opacity: 0.8 }]}
                  onPress={() => updateSettings({ timeMode: opt.value })}
                >
                  <Text style={{ fontSize: 12, color: settings.timeMode === opt.value ? "#fff" : c.muted, fontWeight: "600", textAlign: "center" }}>{opt.label}</Text>
                </Pressable>
              ))}
            </View>

            <Text style={{ fontSize: 13, fontWeight: "600", color: c.muted, marginTop: 16, marginBottom: 8 }}>所要時間</Text>
            <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap" }}>
              {DURATION_OPTIONS.map((opt) => (
                <Pressable
                  key={opt.value}
                  style={({ pressed }) => [{ paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, backgroundColor: c.background, borderWidth: 1, borderColor: c.border }, settings.requiredDurationMinutes === opt.value && { backgroundColor: c.primary, borderColor: c.primary }, pressed && { opacity: 0.8 }]}
                  onPress={() => updateSettings({ requiredDurationMinutes: opt.value, minDurationMinutes: opt.value })}
                >
                  <Text style={{ fontSize: 13, color: settings.requiredDurationMinutes === opt.value ? "#fff" : c.muted, fontWeight: settings.requiredDurationMinutes === opt.value ? "700" : "500" }}>{opt.label}</Text>
                </Pressable>
              ))}
            </View>

            <Text style={{ fontSize: 13, fontWeight: "600", color: c.muted, marginTop: 16, marginBottom: 8 }}>開始時刻の刻み</Text>
            <View style={{ flexDirection: "row", gap: 8 }}>
              {([{ label: "正時のみ", sublabel: "10:00, 11:00...", value: 60 }, { label: "30分刻み", sublabel: "10:00, 10:30...", value: 30 }] as const).map((opt) => (
                <Pressable
                  key={opt.value}
                  style={({ pressed }) => [{ flex: 1, paddingHorizontal: 12, paddingVertical: 10, borderRadius: 12, backgroundColor: c.background, borderWidth: 1.5, borderColor: c.border, alignItems: "center" }, settings.startStepMinutes === opt.value && { backgroundColor: c.primary, borderColor: c.primary }, pressed && { opacity: 0.8 }]}
                  onPress={() => updateSettings({ startStepMinutes: opt.value })}
                >
                  <Text style={{ fontSize: 13, fontWeight: "700", color: settings.startStepMinutes === opt.value ? "#fff" : c.foreground }}>{opt.label}</Text>
                  <Text style={{ fontSize: 11, color: settings.startStepMinutes === opt.value ? "rgba(255,255,255,0.8)" : c.muted, marginTop: 2 }}>{opt.sublabel}</Text>
                </Pressable>
              ))}
            </View>

            <Text style={{ fontSize: 13, fontWeight: "600", color: c.muted, marginTop: 16, marginBottom: 8 }}>候補件数</Text>
            <View style={{ flexDirection: "row", gap: 8 }}>
              {SLOT_COUNT_OPTIONS.map((opt) => (
                <Pressable
                  key={opt.value}
                  style={({ pressed }) => [{ paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, backgroundColor: c.background, borderWidth: 1, borderColor: c.border }, settings.maxSlots === opt.value && { backgroundColor: c.primary, borderColor: c.primary }, pressed && { opacity: 0.8 }]}
                  onPress={() => updateSettings({ maxSlots: opt.value })}
                >
                  <Text style={{ fontSize: 13, color: settings.maxSlots === opt.value ? "#fff" : c.muted, fontWeight: settings.maxSlots === opt.value ? "700" : "500" }}>{opt.label}</Text>
                </Pressable>
              ))}
            </View>
          </View>
        )}

        {/* Search Button */}
        <Pressable
          style={({ pressed }) => [
            st.row,
            { justifyContent: "center", gap: 10, backgroundColor: c.primary, marginHorizontal: 16, marginTop: 8, paddingVertical: 16, borderRadius: 18 },
            pressed && { transform: [{ scale: 0.97 }], opacity: 0.9 },
            (isSearching || (searchMode === "date" && selectedDates.length === 0)) && { backgroundColor: c.muted, opacity: 0.6 },
          ]}
          onPress={handleSearch}
          disabled={isSearching || (searchMode === "date" && selectedDates.length === 0)}
        >
          {isSearching ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <>
              <IconSymbol name="magnifyingglass" size={20} color="#fff" />
              <Text style={{ color: "#fff", fontWeight: "700", fontSize: 16 }}>
                {!isAuthenticated ? "ログインして検索" : !googleConnected ? "Googleカレンダーを連携" : "空き時間を検索"}
              </Text>
            </>
          )}
        </Pressable>
      </ScrollView>
    </ScreenContainer>
  );
}

const st = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center" },
  card: { marginHorizontal: 16, marginBottom: 12, borderRadius: 18, padding: 16, borderWidth: 1 },
});
