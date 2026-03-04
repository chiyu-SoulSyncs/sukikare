import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  View,
  Text,
  ScrollView,
  Pressable,
  TextInput,
  StyleSheet,
  Platform,
  Alert,
  Modal,
  FlatList,
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
import {
  loadTemplates,
  saveTemplate,
  deleteTemplate,
  type MessageTemplate,
} from "@/lib/exclusion-settings";

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

const FORMAT_LABELS: Record<MessageFormat, string> = {
  line: "LINE",
  mail: "メール",
  plain: "コピー",
};

function genId() {
  return Math.random().toString(36).slice(2, 10);
}

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
  const [editedMessage, setEditedMessage] = useState<string | null>(null);
  const [isEditing, setIsEditing] = useState(false);

  // 署名情報
  const [sigCompany, setSigCompany] = useState("");
  const [sigDept, setSigDept] = useState("");
  const [sigName, setSigName] = useState("");

  // テンプレート
  const [templates, setTemplates] = useState<MessageTemplate[]>([]);
  const [showTemplateModal, setShowTemplateModal] = useState(false);
  const [showSaveModal, setShowSaveModal] = useState(false);
  const [templateName, setTemplateName] = useState("");

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
    loadTemplates().then(setTemplates);
  }, []);

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

  const generatedMessage = generateMessage({
    slots: selectedSlotList,
    toName: toName.trim() || undefined,
    subject: subject.trim() || undefined,
    signature,
    toneLevel: tone,
    format,
    requiredDurationMinutes: requiredDuration,
  });

  const message = editedMessage ?? generatedMessage;

  const prevSettingsRef = useRef({ format, tone, toName, subject, sigCompany, sigDept, sigName });
  useEffect(() => {
    const prev = prevSettingsRef.current;
    if (
      prev.format !== format || prev.tone !== tone || prev.toName !== toName ||
      prev.subject !== subject || prev.sigCompany !== sigCompany ||
      prev.sigDept !== sigDept || prev.sigName !== sigName
    ) {
      setEditedMessage(null);
      setIsEditing(false);
      prevSettingsRef.current = { format, tone, toName, subject, sigCompany, sigDept, sigName };
    }
  }, [format, tone, toName, subject, sigCompany, sigDept, sigName]);

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
      const FileSystem = await import("expo-file-system/legacy");
      const path = (FileSystem.cacheDirectory ?? "") + "schedule.txt";
      await FileSystem.writeAsStringAsync(path, message);
      await Sharing.shareAsync(path, { mimeType: "text/plain" });
    } else {
      await Clipboard.setStringAsync(message);
    }
  }, [message]);

  // テンプレート保存
  const handleSaveTemplate = useCallback(async () => {
    if (!templateName.trim()) {
      Alert.alert("エラー", "テンプレート名を入力してください");
      return;
    }
    const tmpl: MessageTemplate = {
      id: genId(),
      name: templateName.trim(),
      format,
      content: message,
      createdAt: new Date().toISOString(),
    };
    await saveTemplate(tmpl);
    const updated = await loadTemplates();
    setTemplates(updated);
    setShowSaveModal(false);
    setTemplateName("");
    if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    Alert.alert("保存しました", `「${tmpl.name}」をテンプレートとして保存しました`);
  }, [templateName, format, message]);

  // テンプレート適用
  const handleApplyTemplate = useCallback((tmpl: MessageTemplate) => {
    setEditedMessage(tmpl.content);
    setIsEditing(false);
    setShowTemplateModal(false);
    if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
  }, []);

  // テンプレート削除
  const handleDeleteTemplate = useCallback(async (id: string, name: string) => {
    const doDelete = async () => {
      await deleteTemplate(id);
      const updated = await loadTemplates();
      setTemplates(updated);
      if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    };
    if (Platform.OS === "web") {
      if (window.confirm(`「${name}」を削除しますか？`)) doDelete();
    } else {
      Alert.alert("削除", `「${name}」を削除しますか？`, [
        { text: "キャンセル", style: "cancel" },
        { text: "削除", style: "destructive", onPress: doDelete },
      ]);
    }
  }, []);

  const c = colors;
  const filteredTemplates = templates.filter((t) => t.format === format);

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
                  <Text style={{ fontSize: 18, color: isSelected ? c.primary : c.border, marginRight: 12, lineHeight: 22 }}>●</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 15, fontWeight: "700", color: isSelected ? c.primary : c.foreground, lineHeight: 20 }}>
                      {formatSlotDate(slot)}
                    </Text>
                    <Text style={{ fontSize: 13, color: isSelected ? c.primary : c.muted, marginTop: 2, fontWeight: "500" }}>
                      {formatSlotTime(slot)}
                    </Text>
                  </View>
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

          {/* Format */}
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
                <Text style={{ fontSize: 10, color: format === opt.value ? "rgba(255,255,255,0.8)" : c.muted, marginTop: 2 }}>{opt.desc}</Text>
              </Pressable>
            ))}
          </View>

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
          {/* ヘッダー行 */}
          <View style={[st.row, { justifyContent: "space-between", marginBottom: 10 }]}>
            <View style={st.row}>
              <Text style={{ fontSize: 14, fontWeight: "600", color: c.muted }}>生成メッセージ</Text>
              {editedMessage !== null && (
                <View style={{ marginLeft: 8, backgroundColor: c.warning, borderRadius: 8, paddingHorizontal: 6, paddingVertical: 2 }}>
                  <Text style={{ fontSize: 10, color: "#fff", fontWeight: "700" }}>編集済</Text>
                </View>
              )}
            </View>
            <View style={[st.row, { gap: 6 }]}>
              {/* テンプレート */}
              <Pressable
                style={({ pressed }) => [st.row, { gap: 4, paddingHorizontal: 8, paddingVertical: 6, borderRadius: 20, backgroundColor: c.tealLight }, pressed && { opacity: 0.7 }]}
                onPress={() => setShowTemplateModal(true)}
              >
                <IconSymbol name="doc.text" size={14} color={c.primary} />
                <Text style={{ fontSize: 12, color: c.primary, fontWeight: "600" }}>
                  テンプレ{filteredTemplates.length > 0 ? `(${filteredTemplates.length})` : ""}
                </Text>
              </Pressable>
              {/* 編集 */}
              <Pressable
                style={({ pressed }) => [st.row, { gap: 4, paddingHorizontal: 8, paddingVertical: 6, borderRadius: 20, backgroundColor: isEditing ? c.primary : c.tealLight }, pressed && { opacity: 0.7 }]}
                onPress={() => {
                  if (isEditing) {
                    setIsEditing(false);
                  } else {
                    if (editedMessage === null) setEditedMessage(generatedMessage);
                    setIsEditing(true);
                  }
                }}
              >
                <IconSymbol name={isEditing ? "checkmark" : "pencil"} size={14} color={isEditing ? "#fff" : c.primary} />
                <Text style={{ fontSize: 12, color: isEditing ? "#fff" : c.primary, fontWeight: "600" }}>{isEditing ? "確定" : "編集"}</Text>
              </Pressable>
            </View>
          </View>

          {/* メッセージ本文 */}
          {isEditing ? (
            <TextInput
              value={editedMessage ?? generatedMessage}
              onChangeText={setEditedMessage}
              multiline
              style={[
                st.input,
                { color: c.foreground, backgroundColor: c.background, borderColor: c.primary, minHeight: 160, textAlignVertical: "top", lineHeight: 22, fontSize: 14 }
              ]}
              autoFocus
            />
          ) : (
            <View style={{ backgroundColor: c.background, borderRadius: 12, padding: 14, borderWidth: 1, borderColor: c.border }}>
              <Text style={{ fontSize: 14, color: c.foreground, lineHeight: 22 }}>{message}</Text>
            </View>
          )}

          {/* アクションボタン行 */}
          <View style={[st.row, { gap: 8, marginTop: 12, flexWrap: "wrap" }]}>
            {editedMessage !== null && !isEditing && (
              <Pressable
                style={({ pressed }) => [{ paddingHorizontal: 10, paddingVertical: 7, borderRadius: 20, backgroundColor: c.tealLight }, pressed && { opacity: 0.7 }]}
                onPress={() => { setEditedMessage(null); setIsEditing(false); }}
              >
                <Text style={{ fontSize: 12, color: c.muted }}>リセット</Text>
              </Pressable>
            )}
            {/* テンプレートとして保存 */}
            <Pressable
              style={({ pressed }) => [st.row, { gap: 4, paddingHorizontal: 10, paddingVertical: 7, borderRadius: 20, backgroundColor: c.tealLight }, pressed && { opacity: 0.7 }]}
              onPress={() => { setTemplateName(""); setShowSaveModal(true); }}
            >
              <IconSymbol name="bookmark" size={14} color={c.primary} />
              <Text style={{ fontSize: 12, color: c.primary, fontWeight: "600" }}>テンプレ保存</Text>
            </Pressable>
            <View style={{ flex: 1 }} />
            <Pressable
              style={({ pressed }) => [st.row, { gap: 4, paddingHorizontal: 10, paddingVertical: 7, borderRadius: 20, backgroundColor: c.tealLight }, pressed && { opacity: 0.7 }]}
              onPress={handleShare}
            >
              <IconSymbol name="square.and.arrow.up" size={14} color={c.primary} />
              <Text style={{ fontSize: 12, color: c.primary, fontWeight: "600" }}>共有</Text>
            </Pressable>
            <Pressable
              style={({ pressed }) => [st.row, { gap: 4, paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20, backgroundColor: copied ? c.success : c.primary }, pressed && { opacity: 0.8 }]}
              onPress={handleCopy}
            >
              <IconSymbol name="doc.on.doc" size={14} color="#fff" />
              <Text style={{ fontSize: 13, color: "#fff", fontWeight: "700" }}>{copied ? "コピー済！" : "コピー"}</Text>
            </Pressable>
          </View>
        </View>

      </ScrollView>

      {/* テンプレート一覧モーダル */}
      <Modal
        visible={showTemplateModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowTemplateModal(false)}
      >
        <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.4)", justifyContent: "flex-end" }}>
          <View style={{ backgroundColor: c.background, borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingBottom: 40, maxHeight: "75%" }}>
            <View style={[st.row, { paddingHorizontal: 20, paddingTop: 20, paddingBottom: 12, justifyContent: "space-between" }]}>
              <Text style={{ fontSize: 16, fontWeight: "700", color: c.foreground }}>
                テンプレート一覧（{FORMAT_LABELS[format]}）
              </Text>
              <Pressable
                style={({ pressed }) => [{ padding: 6, borderRadius: 10, backgroundColor: c.tealLight }, pressed && { opacity: 0.7 }]}
                onPress={() => setShowTemplateModal(false)}
              >
                <IconSymbol name="xmark" size={18} color={c.muted} />
              </Pressable>
            </View>
            {filteredTemplates.length === 0 ? (
              <View style={{ alignItems: "center", paddingVertical: 40 }}>
                <Text style={{ fontSize: 14, color: c.muted }}>保存済みのテンプレートはありません</Text>
                <Text style={{ fontSize: 12, color: c.muted, marginTop: 6 }}>「テンプレ保存」ボタンで保存できます</Text>
              </View>
            ) : (
              <FlatList
                data={filteredTemplates}
                keyExtractor={(item) => item.id}
                contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 16 }}
                renderItem={({ item }) => (
                  <View style={[st.row, { backgroundColor: c.surface, borderRadius: 14, padding: 14, marginBottom: 10, borderWidth: 1, borderColor: c.border }]}>
                    <View style={{ flex: 1, marginRight: 10 }}>
                      <Text style={{ fontSize: 14, fontWeight: "700", color: c.foreground, marginBottom: 4 }}>{item.name}</Text>
                      <Text style={{ fontSize: 12, color: c.muted, lineHeight: 18 }} numberOfLines={3}>{item.content}</Text>
                    </View>
                    <View style={{ gap: 8 }}>
                      <Pressable
                        style={({ pressed }) => [{ paddingHorizontal: 12, paddingVertical: 7, borderRadius: 10, backgroundColor: c.primary }, pressed && { opacity: 0.8 }]}
                        onPress={() => handleApplyTemplate(item)}
                      >
                        <Text style={{ fontSize: 12, color: "#fff", fontWeight: "700" }}>使う</Text>
                      </Pressable>
                      <Pressable
                        style={({ pressed }) => [{ paddingHorizontal: 12, paddingVertical: 7, borderRadius: 10, backgroundColor: c.tealLight }, pressed && { opacity: 0.7 }]}
                        onPress={() => handleDeleteTemplate(item.id, item.name)}
                      >
                        <Text style={{ fontSize: 12, color: c.error, fontWeight: "600" }}>削除</Text>
                      </Pressable>
                    </View>
                  </View>
                )}
              />
            )}
          </View>
        </View>
      </Modal>

      {/* テンプレート保存モーダル */}
      <Modal
        visible={showSaveModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowSaveModal(false)}
      >
        <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.4)", justifyContent: "center", paddingHorizontal: 24 }}>
          <View style={{ backgroundColor: c.background, borderRadius: 20, padding: 24 }}>
            <Text style={{ fontSize: 16, fontWeight: "700", color: c.foreground, marginBottom: 16 }}>テンプレートとして保存</Text>
            <Text style={{ fontSize: 12, color: c.muted, marginBottom: 6 }}>テンプレート名</Text>
            <TextInput
              value={templateName}
              onChangeText={setTemplateName}
              placeholder="例：ビジネス丁寧語・メール"
              placeholderTextColor={c.border}
              style={[st.input, { color: c.foreground, backgroundColor: c.surface, borderColor: c.border, marginBottom: 16 }]}
              autoFocus
              returnKeyType="done"
              onSubmitEditing={handleSaveTemplate}
            />
            <View style={[st.row, { gap: 10 }]}>
              <Pressable
                style={({ pressed }) => [{ flex: 1, paddingVertical: 12, borderRadius: 12, alignItems: "center", backgroundColor: c.surface, borderWidth: 1, borderColor: c.border }, pressed && { opacity: 0.7 }]}
                onPress={() => setShowSaveModal(false)}
              >
                <Text style={{ fontSize: 14, color: c.muted, fontWeight: "600" }}>キャンセル</Text>
              </Pressable>
              <Pressable
                style={({ pressed }) => [{ flex: 1, paddingVertical: 12, borderRadius: 12, alignItems: "center", backgroundColor: c.primary }, pressed && { opacity: 0.85 }]}
                onPress={handleSaveTemplate}
              >
                <Text style={{ fontSize: 14, color: "#fff", fontWeight: "700" }}>保存する</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
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
