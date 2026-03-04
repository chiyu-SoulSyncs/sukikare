import React, { useState, useEffect, useCallback } from "react";
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
import { useRouter } from "expo-router";
import * as Clipboard from "expo-clipboard";
import * as Haptics from "expo-haptics";
import * as Sharing from "expo-sharing";
import { ScreenContainer } from "@/components/screen-container";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { useColors } from "@/hooks/use-colors";
import { generateMessage, type ToneLevel, type MessageFormat, type Signature } from "@/lib/message-generator";
import type { FreeSlot } from "@/lib/google-calendar";
import AsyncStorage from "@react-native-async-storage/async-storage";

const WEEKDAYS = ["日", "月", "火", "水", "木", "金", "土"];

function formatSlotDate(slot: FreeSlot) {
  const s = slot.start;
  const m = s.getMonth() + 1;
  const d = s.getDate();
  const w = WEEKDAYS[s.getDay()];
  return `${m}月${d}日（${w}）`;
}

function formatSlotTime(slot: FreeSlot) {
  const s = slot.start;
  const e = slot.end;
  const sh = s.getHours().toString().padStart(2, "0");
  const sm = s.getMinutes().toString().padStart(2, "0");
  const eh = e.getHours().toString().padStart(2, "0");
  const em = e.getMinutes().toString().padStart(2, "0");
  return `${sh}:${sm} 〜 ${eh}:${em}`;
}

const TONE_OPTIONS: { label: string; value: ToneLevel; desc: string }[] = [
  { label: "ビジネス丁寧語", value: "formal", desc: "お世話になっております" },
  { label: "カジュアル", value: "casual", desc: "お疲れ様です！" },
  { label: "タメ口", value: "friendly", desc: "よろしく！" },
];

const FORMAT_OPTIONS: { label: string; value: MessageFormat; desc: string; example: string }[] = [
  { label: "LINEで送る", value: "line", desc: "シンプル箇条書き", example: "● 3/10(月) 10:00〜11:00" },
  { label: "メールで送る", value: "mail", desc: "挨拶・件名付き", example: "● 3月10日（月） 10:00〜11:00" },
  { label: "そのままコピー", value: "plain", desc: "日程のみシンプル", example: "● 3/10(月) 10:00〜11:00" },
];

export default function ResultScreen() {
  const colors = useColors();
  const router = useRouter();

  const [slots, setSlots] = useState<FreeSlot[]>([]);
  const [selectedSlots, setSelectedSlots] = useState<Set<number>>(new Set());
  const [requiredDuration, setRequiredDuration] = useState(60);

  const [toName, setToName] = useState("");
  const [subject, setSubject] = useState("");
  const [tone, setTone] = useState<ToneLevel>("formal");
  const [format, setFormat] = useState<MessageFormat>("mail");
  const [copied, setCopied] = useState(false);

  // 署名情報
  const [sigCompany, setSigCompany] = useState("");
  const [sigDept, setSigDept] = useState("");
  const [sigName, setSigName] = useState("");

  // 署名をAsyncStorageから読み込む
  useEffect(() => {
    AsyncStorage.getItem("mail_signature").then((raw) => {
      if (!raw) return;
      try {
        const sig = JSON.parse(raw);
        setSigCompany(sig.company ?? "");
        setSigDept(sig.department ?? "");
        setSigName(sig.name ?? "");
      } catch {}
    });
  }, []);

  // 署名変更時に自動保存
  const saveSig = useCallback((company: string, department: string, name: string) => {
    AsyncStorage.setItem("mail_signature", JSON.stringify({ company, department, name }));
  }, []);

  useEffect(() => {
    AsyncStorage.getItem("search_results").then((raw) => {
      if (!raw) return;
      try {
        const data = JSON.parse(raw);
        const parsed: FreeSlot[] = (data.slots ?? []).map((s: any) => ({
          start: new Date(s.start),
          end: new Date(s.end),
          durationMinutes: s.durationMinutes,
        }));
        setSlots(parsed);
        setRequiredDuration(data.settings?.requiredDurationMinutes ?? 60);
        // Select all by default
        setSelectedSlots(new Set(parsed.map((_, i) => i)));
      } catch {}
    });
  }, []);

  const toggleSlot = useCallback((idx: number) => {
    if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setSelectedSlots((prev) => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });
  }, []);

  const selectedSlotList = slots.filter((_, i) => selectedSlots.has(i));

  const signature: Signature | undefined =
    format === "mail" && (sigCompany.trim() || sigDept.trim() || sigName.trim())
      ? { company: sigCompany.trim() || undefined, department: sigDept.trim() || undefined, name: sigName.trim() || undefined }
      : undefined;

  const message = generateMessage({
    slots: selectedSlotList,
    toName: toName.trim() || undefined,
    subject: subject.trim() || undefined,
    signature,
    toneLevel: tone,
    format,
    requiredDurationMinutes: requiredDuration,
  });

  const handleCopy = useCallback(async () => {
    await Clipboard.setStringAsync(message);
    if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [message]);

  const handleShare = useCallback(async () => {
    if (Platform.OS === "web") {
      if (navigator.share) {
        await navigator.share({ text: message });
      } else {
        await Clipboard.setStringAsync(message);
        Alert.alert("コピーしました", "共有機能はブラウザでは利用できないため、クリップボードにコピーしました。");
      }
      return;
    }
    const canShare = await Sharing.isAvailableAsync();
    if (canShare) {
      // Write to temp file for sharing
      const FileSystem = await import("expo-file-system/legacy");
      const path = (FileSystem.cacheDirectory ?? "") + "schedule.txt";
      await FileSystem.writeAsStringAsync(path, message);
      await Sharing.shareAsync(path, { mimeType: "text/plain" });
    } else {
      await Clipboard.setStringAsync(message);
    }
  }, [message]);

  const c = colors;

  return (
    <ScreenContainer containerClassName="bg-background">
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 40 }}>

        {/* Header */}
        <View style={[st.row, { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 12 }]}>
          <Pressable
            style={({ pressed }) => [{ padding: 8, borderRadius: 10, backgroundColor: c.tealLight }, pressed && { opacity: 0.7 }]}
            onPress={() => router.back()}
          >
            <IconSymbol name="arrow.left" size={20} color={c.primary} />
          </Pressable>
          <Text style={{ flex: 1, fontSize: 18, fontWeight: "700", color: c.foreground, marginLeft: 12 }}>
            空き時間の結果
          </Text>
        </View>

        {/* Slot List */}
        <View style={[st.card, { backgroundColor: c.surface, borderColor: c.border }]}>
          <Text style={{ fontSize: 14, fontWeight: "600", color: c.muted, marginBottom: 12 }}>
            候補を選択 ({selectedSlots.size}/{slots.length}件)
          </Text>
          {slots.length === 0 ? (
            <View style={{ alignItems: "center", paddingVertical: 24 }}>
              <Text style={{ fontSize: 40, marginBottom: 8 }}>📭</Text>
              <Text style={{ fontSize: 15, color: c.muted, textAlign: "center" }}>
                空き時間が見つかりませんでした。{"\n"}日付や設定を変えてお試しください。
              </Text>
            </View>
          ) : (
            slots.map((slot, i) => {
              const isSelected = selectedSlots.has(i);
              return (
                <Pressable
                  key={i}
                  style={({ pressed }) => [
                    st.row,
                    { paddingHorizontal: 14, paddingVertical: 12, borderRadius: 14, marginBottom: 8, borderWidth: 1.5 },
                    isSelected ? { backgroundColor: c.tealLight, borderColor: c.primary } : { backgroundColor: c.background, borderColor: c.border },
                    pressed && { opacity: 0.8 },
                  ]}
                  onPress={() => toggleSlot(i)}
                >
                  {/* ● インジケータ */}
                  <Text style={{ fontSize: 18, color: isSelected ? c.primary : c.border, marginRight: 12, lineHeight: 22 }}>●</Text>
                  {/* 日付（大）・時間（小）の2段組み */}
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 15, fontWeight: "700", color: isSelected ? c.primary : c.foreground, lineHeight: 20 }}>
                      {formatSlotDate(slot)}
                    </Text>
                    <Text style={{ fontSize: 13, color: isSelected ? c.primary : c.muted, marginTop: 2, fontWeight: "500" }}>
                      {formatSlotTime(slot)}
                    </Text>
                  </View>
                  {/* チェックマーク */}
                  <View style={[{ width: 22, height: 22, borderRadius: 11, borderWidth: 2, alignItems: "center", justifyContent: "center" }, isSelected ? { backgroundColor: c.primary, borderColor: c.primary } : { borderColor: c.border }]}>
                    {isSelected && <IconSymbol name="checkmark" size={13} color="#fff" />}
                  </View>
                </Pressable>
              );
            })
          )}
        </View>

        {/* Message Options */}
        <View style={[st.card, { backgroundColor: c.surface, borderColor: c.border }]}>
          <Text style={{ fontSize: 14, fontWeight: "600", color: c.muted, marginBottom: 12 }}>メッセージ設定</Text>

          {/* Format - 先頭に移動 */}
          <Text style={{ fontSize: 12, color: c.muted, marginBottom: 8 }}>送る先</Text>
          <View style={{ flexDirection: "row", gap: 8 }}>
            {FORMAT_OPTIONS.map((opt) => (
              <Pressable
                key={opt.value}
                style={({ pressed }) => [
                  { flex: 1, paddingVertical: 10, borderRadius: 12, borderWidth: 1.5, alignItems: "center" },
                  format === opt.value ? { backgroundColor: c.primary, borderColor: c.primary } : { backgroundColor: c.background, borderColor: c.border },
                  pressed && { opacity: 0.8 },
                ]}
                onPress={() => setFormat(opt.value)}
              >
                <Text style={{ fontSize: 11, fontWeight: "700", color: format === opt.value ? "#fff" : c.foreground }}>{opt.label}</Text>
                <Text style={{ fontSize: 9, color: format === opt.value ? "rgba(255,255,255,0.7)" : c.muted, marginTop: 2 }}>{opt.example}</Text>
              </Pressable>
            ))}
          </View>

          {/* plain以外のみ: 宛先・件名・敬語レベルを表示 */}
          {format !== "plain" && (
            <>
              <Text style={{ fontSize: 12, color: c.muted, marginBottom: 4, marginTop: 16 }}>宛先（任意）</Text>
              <TextInput
                value={toName}
                onChangeText={setToName}
                placeholder="例：田中"
                placeholderTextColor={c.border}
                style={[st.input, { color: c.foreground, backgroundColor: c.background, borderColor: c.border }]}
                returnKeyType="done"
              />

              {format === "mail" && (
                <>
                  <Text style={{ fontSize: 12, color: c.muted, marginBottom: 4, marginTop: 12 }}>件名（任意）</Text>
                  <TextInput
                    value={subject}
                    onChangeText={setSubject}
                    placeholder="例：打ち合わせのご提案"
                    placeholderTextColor={c.border}
                    style={[st.input, { color: c.foreground, backgroundColor: c.background, borderColor: c.border }]}
                    returnKeyType="done"
                  />

                  {/* 署名 */}
                  <View style={[st.row, { marginTop: 16, marginBottom: 6 }]}>
                    <Text style={{ fontSize: 12, color: c.muted, flex: 1 }}>署名（任意・自動保存）</Text>
                  </View>
                  <TextInput
                    value={sigCompany}
                    onChangeText={(v) => { setSigCompany(v); saveSig(v, sigDept, sigName); }}
                    placeholder="会社名"
                    placeholderTextColor={c.border}
                    style={[st.input, { color: c.foreground, backgroundColor: c.background, borderColor: c.border }]}
                    returnKeyType="next"
                  />
                  <TextInput
                    value={sigDept}
                    onChangeText={(v) => { setSigDept(v); saveSig(sigCompany, v, sigName); }}
                    placeholder="部署名"
                    placeholderTextColor={c.border}
                    style={[st.input, { color: c.foreground, backgroundColor: c.background, borderColor: c.border, marginTop: 6 }]}
                    returnKeyType="next"
                  />
                  <TextInput
                    value={sigName}
                    onChangeText={(v) => { setSigName(v); saveSig(sigCompany, sigDept, v); }}
                    placeholder="氏名"
                    placeholderTextColor={c.border}
                    style={[st.input, { color: c.foreground, backgroundColor: c.background, borderColor: c.border, marginTop: 6 }]}
                    returnKeyType="done"
                  />
                </>
              )}

              <Text style={{ fontSize: 12, color: c.muted, marginBottom: 8, marginTop: 16 }}>敬語レベル</Text>
              <View style={{ flexDirection: "row", gap: 8 }}>
                {TONE_OPTIONS.map((opt) => (
                  <Pressable
                    key={opt.value}
                    style={({ pressed }) => [
                      { flex: 1, paddingVertical: 10, borderRadius: 12, borderWidth: 1.5, alignItems: "center" },
                      tone === opt.value ? { backgroundColor: c.primary, borderColor: c.primary } : { backgroundColor: c.background, borderColor: c.border },
                      pressed && { opacity: 0.8 },
                    ]}
                    onPress={() => setTone(opt.value)}
                  >
                    <Text style={{ fontSize: 11, fontWeight: "700", color: tone === opt.value ? "#fff" : c.foreground }}>{opt.label}</Text>
                    <Text style={{ fontSize: 10, color: tone === opt.value ? "rgba(255,255,255,0.8)" : c.muted, marginTop: 2 }}>{opt.desc}</Text>
                  </Pressable>
                ))}
              </View>
            </>
          )}
        </View>

        {/* Generated Message Preview */}
        <View style={[st.card, { backgroundColor: c.surface, borderColor: c.border }]}>
          <View style={[st.row, { justifyContent: "space-between", marginBottom: 12 }]}>
            <Text style={{ fontSize: 14, fontWeight: "600", color: c.muted }}>生成メッセージ</Text>
            <View style={[st.row, { gap: 8 }]}>
              <Pressable
                style={({ pressed }) => [st.row, { gap: 4, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20, backgroundColor: c.tealLight }, pressed && { opacity: 0.7 }]}
                onPress={handleShare}
              >
                <IconSymbol name="square.and.arrow.up" size={16} color={c.primary} />
                <Text style={{ fontSize: 13, color: c.primary, fontWeight: "600" }}>共有</Text>
              </Pressable>
              <Pressable
                style={({ pressed }) => [st.row, { gap: 4, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20, backgroundColor: copied ? c.success : c.primary }, pressed && { opacity: 0.8 }]}
                onPress={handleCopy}
              >
                <IconSymbol name="doc.on.doc" size={16} color="#fff" />
                <Text style={{ fontSize: 13, color: "#fff", fontWeight: "700" }}>{copied ? "コピー済！" : "コピー"}</Text>
              </Pressable>
            </View>
          </View>
          <View style={{ backgroundColor: c.background, borderRadius: 12, padding: 14, borderWidth: 1, borderColor: c.border }}>
            <Text style={{ fontSize: 14, color: c.foreground, lineHeight: 22 }}>{message}</Text>
          </View>
        </View>

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
