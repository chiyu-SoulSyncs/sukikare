import React, { useState, useCallback, useEffect } from "react";
import {
  View,
  Text,
  ScrollView,
  Pressable,
  StyleSheet,
  ActivityIndicator,
  Platform,
  Alert,
} from "react-native";
import * as Haptics from "expo-haptics";
import { ScreenContainer } from "@/components/screen-container";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { useColors } from "@/hooks/use-colors";
import { useAuth } from "@/hooks/use-auth";
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

export default function SettingsScreen() {
  const colors = useColors();
  const router = useRouter();
  const { user, isAuthenticated, loading: authLoading } = useAuth();

  const [googleConnected, setGoogleConnected] = useState(false);
  const [checkingGoogle, setCheckingGoogle] = useState(false);
  const [calendars, setCalendars] = useState<GoogleCalendar[]>([]);
  const [selectedCalendarIds, setSelectedCalendarIds] = useState<string[]>(["primary"]);
  const [loadingCalendars, setLoadingCalendars] = useState(false);

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
          loadSelectedCalendars(),
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

  // Handle return from Google OAuth
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
    await startGoogleAuth(String(user.id));
  }, [user]);

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
    await saveSelectedCalendars(next);
  }, [selectedCalendarIds]);

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

                  {/* Calendar Selection */}
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
};
