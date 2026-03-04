import React from "react";
import { View, Text, Pressable, StyleSheet, Platform } from "react-native";
import { useRouter } from "expo-router";
import * as Haptics from "expo-haptics";
import { ScreenContainer } from "@/components/screen-container";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { useColors } from "@/hooks/use-colors";
import { startOAuthLogin } from "@/constants/oauth";

export default function LoginScreen() {
  const colors = useColors();
  const router = useRouter();
  const c = colors;

  const handleLogin = async () => {
    if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    await startOAuthLogin();
  };

  return (
    <ScreenContainer containerClassName="bg-background" edges={["top", "bottom", "left", "right"]}>
      <View style={{ flex: 1, justifyContent: "space-between", paddingHorizontal: 24, paddingVertical: 32 }}>

        {/* Close Button */}
        <View style={{ alignItems: "flex-end" }}>
          <Pressable
            style={({ pressed }) => [{ padding: 10, borderRadius: 20, backgroundColor: c.surface }, pressed && { opacity: 0.7 }]}
            onPress={() => router.back()}
          >
            <IconSymbol name="xmark" size={20} color={c.muted} />
          </Pressable>
        </View>

        {/* Hero */}
        <View style={{ alignItems: "center", gap: 16 }}>
          <View style={{ width: 96, height: 96, borderRadius: 28, backgroundColor: c.tealLight, alignItems: "center", justifyContent: "center" }}>
            <IconSymbol name="calendar.badge.clock" size={52} color={c.primary} />
          </View>
          <Text style={{ fontSize: 28, fontWeight: "800", color: c.foreground, textAlign: "center" }}>
            スケジュール{"\n"}アシスタント
          </Text>
          <Text style={{ fontSize: 16, color: c.muted, textAlign: "center", lineHeight: 24 }}>
            Googleカレンダーと連携して{"\n"}空き時間を自動で見つけます
          </Text>

          {/* Features */}
          <View style={{ width: "100%", gap: 12, marginTop: 16 }}>
            {[
              { icon: "calendar", text: "Googleカレンダーから空き時間を自動抽出" },
              { icon: "text.bubble", text: "日程調整メッセージを自動生成" },
              { icon: "doc.on.doc", text: "ワンタップでコピー・共有" },
            ].map((item, i) => (
              <View key={i} style={[st.row, { backgroundColor: c.surface, borderRadius: 14, padding: 14, gap: 12 }]}>
                <View style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: c.tealLight, alignItems: "center", justifyContent: "center" }}>
                  <IconSymbol name={item.icon as any} size={20} color={c.primary} />
                </View>
                <Text style={{ flex: 1, fontSize: 14, color: c.foreground, fontWeight: "500" }}>{item.text}</Text>
              </View>
            ))}
          </View>
        </View>

        {/* Login Button */}
        <View style={{ gap: 12 }}>
          <Pressable
            style={({ pressed }) => [
              st.row,
              { justifyContent: "center", gap: 12, backgroundColor: c.primary, paddingVertical: 18, borderRadius: 18 },
              pressed && { transform: [{ scale: 0.97 }], opacity: 0.9 },
            ]}
            onPress={handleLogin}
          >
            <IconSymbol name="person.circle.fill" size={24} color="#fff" />
            <Text style={{ color: "#fff", fontWeight: "800", fontSize: 17 }}>Googleでログイン</Text>
          </Pressable>
          <Text style={{ fontSize: 12, color: c.muted, textAlign: "center", lineHeight: 18 }}>
            ログインすることで、利用規約とプライバシーポリシーに同意したものとみなします
          </Text>
        </View>

      </View>
    </ScreenContainer>
  );
}

const st = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center" },
});
