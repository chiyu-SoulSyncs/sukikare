import React, { useState, useCallback } from "react";
import {
  View,
  Text,
  ScrollView,
  Pressable,
  TextInput,
  StyleSheet,
  Platform,
  Alert,
  FlatList,
  Modal,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Clipboard from "expo-clipboard";
import * as Haptics from "expo-haptics";
import { ScreenContainer } from "@/components/screen-container";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { useColors } from "@/hooks/use-colors";
import { trpc } from "@/lib/trpc";
import { useAuthContext } from "@/lib/auth-context";
import {
  generateGreeting,
  type GreetingScene,
  type GreetingTone,
  type ProfileCard,
  type MeetingInfo,
  type ReplyStyle,
  type ReplySubtype,
} from "@/lib/greeting-generator";

// ─────────────────────────────────────────────
// 定数
// ─────────────────────────────────────────────

const SCENES: { id: GreetingScene; label: string; icon: string; desc: string }[] = [
  { id: "intro",    label: "自己紹介",       icon: "hand.wave.fill",    desc: "グループ参加時の挨拶" },
  { id: "thanks",   label: "ミーティングお礼", icon: "checkmark.circle.fill", desc: "打ち合わせ後のお礼" },
  { id: "reminder", label: "リマインド",      icon: "bell.fill",         desc: "会議前のリマインド送付" },
  { id: "next",     label: "次回案内",        icon: "calendar.badge.plus", desc: "日程調整の依頼" },
  { id: "reply",    label: "返信",           icon: "arrow.uturn.right",  desc: "かしこまりました系" },
];

const TONES: { id: GreetingTone; label: string }[] = [
  { id: "formal",   label: "ビジネス丁寧語" },
  { id: "casual",   label: "カジュアル" },
  { id: "friendly", label: "タメ口" },
];

const REPLY_SUBTYPES: { id: ReplySubtype; label: string; icon: string; desc: string }[] = [
  { id: "confirmed",      label: "日程が決まった",     icon: "checkmark.circle.fill",  desc: "相手が候補日を選んでくれた" },
  { id: "reschedule",     label: "別候補を依頼",       icon: "calendar.badge.plus",    desc: "日程が合わず、改めて提案" },
  { id: "declined",       label: "断られた",           icon: "xmark.circle.fill",      desc: "先方から論じられた" },
  { id: "pending",        label: "保留・検討中",       icon: "clock.fill",             desc: "検討しますと言われた" },
  { id: "self_decline",   label: "こちらから辞辺",     icon: "hand.raised.fill",       desc: "こちらが断る場合" },
  { id: "change_request", label: "日程変更を依頼",     icon: "arrow.triangle.2.circlepath", desc: "一度決まった日程を変更したい" },
];

// ─────────────────────────────────────────────
// プロフィールカード編集モーダル
// ─────────────────────────────────────────────

interface CardEditorProps {
  visible: boolean;
  isEditing?: boolean;
  initial?: { label: string; name: string; company: string; role: string };
  onSave: (data: { label: string; name: string; company: string; role: string }) => void;
  onCancel: () => void;
  colors: ReturnType<typeof useColors>;
}

function CardEditor({ visible, isEditing, initial, onSave, onCancel, colors: c }: CardEditorProps) {
  const [label, setLabel] = useState(initial?.label ?? "");
  const [name, setName] = useState(initial?.name ?? "");
  const [company, setCompany] = useState(initial?.company ?? "");
  const [role, setRole] = useState(initial?.role ?? "");

  // initial変更時にリセット
  React.useEffect(() => {
    setLabel(initial?.label ?? "");
    setName(initial?.name ?? "");
    setCompany(initial?.company ?? "");
    setRole(initial?.role ?? "");
  }, [initial]);

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onCancel}>
      <View style={{ flex: 1, backgroundColor: c.background }}>
        <View style={[st.row, { justifyContent: "space-between", padding: 20, borderBottomWidth: 1, borderBottomColor: c.border }]}>
          <Pressable style={({ pressed }) => [pressed && { opacity: 0.6 }]} onPress={onCancel}>
            <Text style={{ fontSize: 16, color: c.muted }}>キャンセル</Text>
          </Pressable>
          <Text style={{ fontSize: 17, fontWeight: "700", color: c.foreground }}>{isEditing ? "カードを編集" : "カードを追加"}</Text>
          <Pressable
            style={({ pressed }) => [pressed && { opacity: 0.6 }]}
            onPress={() => {
              if (!label.trim() || !name.trim()) {
                Alert.alert("入力エラー", "ラベルと名前は必須です。");
                return;
              }
              onSave({ label: label.trim(), name: name.trim(), company: company.trim(), role: role.trim() });
            }}
          >
            <Text style={{ fontSize: 16, fontWeight: "700", color: c.primary }}>保存</Text>
          </Pressable>
        </View>
        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 20, gap: 16 }}>
          <View style={{ gap: 6 }}>
            <Text style={{ fontSize: 13, fontWeight: "600", color: c.muted }}>ラベル（ボタン名）*</Text>
            <TextInput
              value={label}
              onChangeText={setLabel}
              placeholder="例: 本名、副業用、○○株式会社"
              placeholderTextColor={c.muted}
              style={[st.input, { color: c.foreground, backgroundColor: c.surface, borderColor: c.border }]}
            />
          </View>
          <View style={{ gap: 6 }}>
            <Text style={{ fontSize: 13, fontWeight: "600", color: c.muted }}>名前 *</Text>
            <TextInput
              value={name}
              onChangeText={setName}
              placeholder="例: 田中 太郎"
              placeholderTextColor={c.muted}
              style={[st.input, { color: c.foreground, backgroundColor: c.surface, borderColor: c.border }]}
            />
          </View>
          <View style={{ gap: 6 }}>
            <Text style={{ fontSize: 13, fontWeight: "600", color: c.muted }}>会社名（任意）</Text>
            <TextInput
              value={company}
              onChangeText={setCompany}
              placeholder="例: 株式会社○○"
              placeholderTextColor={c.muted}
              style={[st.input, { color: c.foreground, backgroundColor: c.surface, borderColor: c.border }]}
            />
          </View>
          <View style={{ gap: 6 }}>
            <Text style={{ fontSize: 13, fontWeight: "600", color: c.muted }}>役職（任意）</Text>
            <TextInput
              value={role}
              onChangeText={setRole}
              placeholder="例: 営業部 マネージャー"
              placeholderTextColor={c.muted}
              style={[st.input, { color: c.foreground, backgroundColor: c.surface, borderColor: c.border }]}
            />
          </View>
        </ScrollView>
      </View>
    </Modal>
  );
}

// ─────────────────────────────────────────────
// メイン画面
// ─────────────────────────────────────────────

export default function GreetingScreen() {
  const c = useColors();
  const { user } = useAuthContext();

  // プロフィールカード
  const { data: cards = [], refetch: refetchCards } = trpc.profileCards.list.useQuery(
    undefined,
    { enabled: !!user }
  );
  const createCard = trpc.profileCards.create.useMutation({ onSuccess: () => refetchCards() });
  const updateCard = trpc.profileCards.update.useMutation({ onSuccess: () => refetchCards() });
  const deleteCard = trpc.profileCards.delete.useMutation({ onSuccess: () => refetchCards() });

  const [selectedCardId, setSelectedCardId] = useState<number | null>(null);
  const [editorVisible, setEditorVisible] = useState(false);
  const [editingCard, setEditingCard] = useState<typeof cards[0] | null>(null);

  // シーン・トーン
  const [scene, setScene] = useState<GreetingScene>("intro");
  const [tone, setTone] = useState<GreetingTone>("formal");

  // 追加入力
  const [recipientName, setRecipientName] = useState("");
  const [meetingPurpose, setMeetingPurpose] = useState("");
  const [meetingDate, setMeetingDate] = useState("");
  const [meetingTime, setMeetingTime] = useState("");
  const [meetingUrl, setMeetingUrl] = useState("");
  const [nextAction, setNextAction] = useState("");
  const [theirAction, setTheirAction] = useState("");
  // 次回案内シーン用: 検索タブから転送された日程テキスト
  const [scheduleText, setScheduleText] = useState("");

  // 次回案内シーン選択時に転送データを自動読み込み
  React.useEffect(() => {
    if (scene !== "next") return;
    (async () => {
      try {
        const stored = await AsyncStorage.getItem("greeting_schedule_transfer");
        if (stored) {
          setScheduleText(stored);
          await AsyncStorage.removeItem("greeting_schedule_transfer");
        }
      } catch {}
    })();
  }, [scene]);

  // 署名・返信スタイル
  const [includeSignature, setIncludeSignature] = useState(true);
  const [replyStyle, setReplyStyle] = useState<ReplyStyle>("kashikomarimashita");
  // 返信シーン分岐
  const [replySubtype, setReplySubtype] = useState<ReplySubtype>("confirmed");
  const [confirmedDate, setConfirmedDate] = useState("");
  const [newScheduleText, setNewScheduleText] = useState("");

  // 生成メッセージ
  const [generated, setGenerated] = useState<string | null>(null);
  const [editedMessage, setEditedMessage] = useState<string | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [copied, setCopied] = useState(false);

  const selectedCard = cards.find(c => c.id === selectedCardId) ?? (cards.length > 0 ? cards[0] : null);

  const handleGenerate = useCallback(() => {
    if (!selectedCard) {
      Alert.alert("プロフィールカードを選択してください", "まず「＋」ボタンでカードを作成してください。");
      return;
    }
    const profile: ProfileCard = {
      id: selectedCard.id,
      label: selectedCard.label,
      name: selectedCard.name,
      company: selectedCard.company,
      role: selectedCard.role,
    };
    const meeting: MeetingInfo = {
      purpose: meetingPurpose.trim() || undefined,
      date: meetingDate.trim() || undefined,
      time: meetingTime.trim() || undefined,
      url: meetingUrl.trim() || undefined,
      nextAction: nextAction.trim() || undefined,
      theirAction: theirAction.trim() || undefined,
    };
    const msg = generateGreeting({
      scene,
      tone,
      profile,
      meeting,
      scheduleText: scene === "next" ? (scheduleText.trim() || undefined) : undefined,
      recipientName: recipientName.trim() || undefined,
      includeSignature,
      replyStyle,
      replySubtype: scene === "reply" ? replySubtype : undefined,
      confirmedDate: scene === "reply" && replySubtype === "confirmed" ? (confirmedDate.trim() || undefined) : undefined,
      newScheduleText: scene === "reply" && (replySubtype === "reschedule" || replySubtype === "change_request") ? (newScheduleText.trim() || undefined) : undefined,
    });
    setGenerated(msg);
    setEditedMessage(null);
    setIsEditing(false);
    if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  }, [selectedCard, scene, tone, recipientName, meetingPurpose, meetingDate, meetingTime, meetingUrl, nextAction, theirAction, scheduleText, includeSignature, replyStyle, replySubtype, confirmedDate, newScheduleText]);

  const displayMessage = editedMessage ?? generated;

  const handleCopy = useCallback(async () => {
    if (!displayMessage) return;
    await Clipboard.setStringAsync(displayMessage);
    if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [displayMessage]);

  const needsMeeting = scene === "reminder" || scene === "thanks";
  const needsRecipient = scene === "intro";

  return (
    <ScreenContainer containerClassName="bg-background">
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 40 }}>

        {/* Header */}
        <View style={{ paddingHorizontal: 20, paddingTop: 16, paddingBottom: 8 }}>
          <Text style={{ fontSize: 26, fontWeight: "800", color: c.foreground }}>挨拶文メーカー</Text>
          <Text style={{ fontSize: 14, color: c.muted, marginTop: 4 }}>シーンを選んでボタンを押すだけ</Text>
        </View>

        {/* プロフィールカード選択 */}
        <View style={[st.card, { backgroundColor: c.surface, borderColor: c.border }]}>
          <View style={[st.row, { justifyContent: "space-between", marginBottom: 12 }]}>
            <Text style={{ fontSize: 14, fontWeight: "700", color: c.foreground }}>プロフィール</Text>
            <Pressable
              style={({ pressed }) => [st.row, { gap: 4, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20, backgroundColor: c.primary }, pressed && { opacity: 0.7 }]}
              onPress={() => { setEditingCard(null); setEditorVisible(true); }}
            >
              <IconSymbol name="plus" size={14} color="#fff" />
              <Text style={{ fontSize: 13, color: "#fff", fontWeight: "700" }}>追加</Text>
            </Pressable>
          </View>

          {!user && (
            <View style={{ backgroundColor: c.tealLight, borderRadius: 10, padding: 12 }}>
              <Text style={{ fontSize: 13, color: c.muted, textAlign: "center" }}>ログインするとプロフィールカードを保存できます</Text>
            </View>
          )}

          {user && cards.length === 0 && (
            <View style={{ backgroundColor: c.tealLight, borderRadius: 10, padding: 12 }}>
              <Text style={{ fontSize: 13, color: c.muted, textAlign: "center" }}>「＋追加」でプロフィールカードを作成してください</Text>
            </View>
          )}

          {cards.length > 0 && (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginHorizontal: -4 }}>
              <View style={[st.row, { gap: 8, paddingHorizontal: 4 }]}>
                {cards.map(card => {
                  const isSelected = (selectedCardId ?? cards[0]?.id) === card.id;
                  return (
                    <Pressable
                      key={card.id}
                      style={({ pressed }) => [{
                        paddingHorizontal: 14,
                        paddingVertical: 10,
                        borderRadius: 14,
                        borderWidth: 2,
                        borderColor: isSelected ? c.primary : c.border,
                        backgroundColor: isSelected ? c.tealLight : c.background,
                        minWidth: 100,
                      }, pressed && { opacity: 0.7 }]}
                      onPress={() => setSelectedCardId(card.id)}
                      onLongPress={() => {
                        Alert.alert(card.label, "カードを編集または削除できます", [
                          { text: "キャンセル", style: "cancel" },
                          { text: "編集", onPress: () => { setEditingCard(card); setEditorVisible(true); } },
                          { text: "削除", style: "destructive", onPress: () => deleteCard.mutate({ id: card.id }) },
                        ]);
                      }}
                    >
                      <Text style={{ fontSize: 13, fontWeight: "700", color: isSelected ? c.primary : c.foreground }}>{card.label}</Text>
                      <Text style={{ fontSize: 11, color: c.muted, marginTop: 2 }} numberOfLines={1}>{card.name}</Text>
                    </Pressable>
                  );
                })}
              </View>
            </ScrollView>
          )}
        </View>

        {/* シーン選択 */}
        <View style={[st.card, { backgroundColor: c.surface, borderColor: c.border }]}>
          <Text style={{ fontSize: 14, fontWeight: "700", color: c.foreground, marginBottom: 12 }}>シーン</Text>
          <View style={{ gap: 8 }}>
            {SCENES.map(s => {
              const isSelected = scene === s.id;
              return (
                <Pressable
                  key={s.id}
                  style={({ pressed }) => [st.row, {
                    gap: 12, padding: 12, borderRadius: 12, borderWidth: 2,
                    borderColor: isSelected ? c.primary : c.border,
                    backgroundColor: isSelected ? c.tealLight : c.background,
                  }, pressed && { opacity: 0.7 }]}
                  onPress={() => { setScene(s.id); setGenerated(null); }}
                >
                  <IconSymbol name={s.icon as any} size={22} color={isSelected ? c.primary : c.muted} />
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 14, fontWeight: "700", color: isSelected ? c.primary : c.foreground }}>{s.label}</Text>
                    <Text style={{ fontSize: 12, color: c.muted }}>{s.desc}</Text>
                  </View>
                  {isSelected && <IconSymbol name="checkmark.circle.fill" size={20} color={c.primary} />}
                </Pressable>
              );
            })}
          </View>
        </View>

        {/* トーン選択 */}
        <View style={[st.card, { backgroundColor: c.surface, borderColor: c.border }]}>
          <Text style={{ fontSize: 14, fontWeight: "700", color: c.foreground, marginBottom: 10 }}>トーン</Text>
          <View style={[st.row, { gap: 8 }]}>
            {TONES.map(t => {
              const isSelected = tone === t.id;
              return (
                <Pressable
                  key={t.id}
                  style={({ pressed }) => [{
                    flex: 1, paddingVertical: 10, borderRadius: 10, alignItems: "center",
                    borderWidth: 2,
                    borderColor: isSelected ? c.primary : c.border,
                    backgroundColor: isSelected ? c.primary : c.background,
                  }, pressed && { opacity: 0.7 }]}
                  onPress={() => { setTone(t.id); setGenerated(null); }}
                >
                  <Text style={{ fontSize: 12, fontWeight: "700", color: isSelected ? "#fff" : c.muted }}>{t.label}</Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        {/* 署名・返信スタイル設定 */}
        <View style={[st.card, { backgroundColor: c.surface, borderColor: c.border }]}>
          {/* 署名ON/OFF */}
          <View style={[st.row, { justifyContent: "space-between", marginBottom: includeSignature ? 14 : 0 }]}>
            <View>
              <Text style={{ fontSize: 14, fontWeight: "700", color: c.foreground }}>署名を含める</Text>
              <Text style={{ fontSize: 12, color: c.muted, marginTop: 2 }}>プロフィールカードの情報を末尾に追加</Text>
            </View>
            <Pressable
              style={({ pressed }) => [{
                width: 50, height: 28, borderRadius: 14,
                backgroundColor: includeSignature ? c.primary : c.border,
                justifyContent: "center",
                paddingHorizontal: 3,
              }, pressed && { opacity: 0.8 }]}
              onPress={() => setIncludeSignature(v => !v)}
            >
              <View style={{
                width: 22, height: 22, borderRadius: 11, backgroundColor: "#fff",
                alignSelf: includeSignature ? "flex-end" : "flex-start",
              }} />
            </Pressable>
          </View>

          {/* 返信スタイル（replyシーンのみ） */}
          {scene === "reply" && (
            <View style={{ marginTop: includeSignature ? 0 : 0 }}>
              <Text style={{ fontSize: 13, fontWeight: "700", color: c.foreground, marginBottom: 8 }}>返信スタイル</Text>
              <View style={[st.row, { gap: 8 }]}>
                {(["kashikomarimashita", "shochishimashita"] as const).map((style) => (
                  <Pressable
                    key={style}
                    style={({ pressed }) => [{
                      flex: 1, paddingVertical: 10, borderRadius: 10, alignItems: "center",
                      borderWidth: 2,
                      borderColor: replyStyle === style ? c.primary : c.border,
                      backgroundColor: replyStyle === style ? c.primary : c.background,
                    }, pressed && { opacity: 0.7 }]}
                    onPress={() => setReplyStyle(style)}
                  >
                    <Text style={{ fontSize: 12, fontWeight: "700", color: replyStyle === style ? "#fff" : c.muted }}>
                      {style === "kashikomarimashita" ? "かしこまりました" : "承知いたしました"}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </View>
          )}
        </View>

        {/* 追加入力（シーン依存） */}
        {needsRecipient && (
          <View style={[st.card, { backgroundColor: c.surface, borderColor: c.border }]}>
            <Text style={{ fontSize: 14, fontWeight: "700", color: c.foreground, marginBottom: 10 }}>グループ名（任意）</Text>
            <TextInput
              value={recipientName}
              onChangeText={setRecipientName}
              placeholder="例: ○○プロジェクトの皆様"
              placeholderTextColor={c.muted}
              style={[st.input, { color: c.foreground, backgroundColor: c.background, borderColor: c.border }]}
            />
          </View>
        )}

        {needsMeeting && (
          <View style={[st.card, { backgroundColor: c.surface, borderColor: c.border, gap: 12 }]}>
            <Text style={{ fontSize: 14, fontWeight: "700", color: c.foreground }}>会議情報（任意）</Text>
            <View style={{ gap: 6 }}>
              <Text style={{ fontSize: 12, color: c.muted }}>目的</Text>
              <TextInput value={meetingPurpose} onChangeText={setMeetingPurpose} placeholder="例: 進捗のご報告" placeholderTextColor={c.muted}
                style={[st.input, { color: c.foreground, backgroundColor: c.background, borderColor: c.border }]} />
            </View>
            <View style={[st.row, { gap: 8 }]}>
              <View style={{ flex: 1, gap: 6 }}>
                <Text style={{ fontSize: 12, color: c.muted }}>日付</Text>
                <TextInput value={meetingDate} onChangeText={setMeetingDate} placeholder="例: 9月12日 (金曜日)" placeholderTextColor={c.muted}
                  style={[st.input, { color: c.foreground, backgroundColor: c.background, borderColor: c.border }]} />
              </View>
              <View style={{ flex: 1, gap: 6 }}>
                <Text style={{ fontSize: 12, color: c.muted }}>時間</Text>
                <TextInput value={meetingTime} onChangeText={setMeetingTime} placeholder="例: 午後7:00〜8:00" placeholderTextColor={c.muted}
                  style={[st.input, { color: c.foreground, backgroundColor: c.background, borderColor: c.border }]} />
              </View>
            </View>
            <View style={{ gap: 6 }}>
              <Text style={{ fontSize: 12, color: c.muted }}>URL</Text>
              <TextInput value={meetingUrl} onChangeText={setMeetingUrl} placeholder="https://..." placeholderTextColor={c.muted}
                style={[st.input, { color: c.foreground, backgroundColor: c.background, borderColor: c.border }]} />
            </View>
            {scene === "thanks" && (
              <>
                <View style={{ gap: 6 }}>
                  <Text style={{ fontSize: 12, color: c.muted }}>弊社対応事項（任意）</Text>
                  <TextInput value={nextAction} onChangeText={setNextAction} placeholder="例: 資料を送付する" placeholderTextColor={c.muted} multiline
                    style={[st.input, { color: c.foreground, backgroundColor: c.background, borderColor: c.border, minHeight: 60, textAlignVertical: "top" }]} />
                </View>
                <View style={{ gap: 6 }}>
                  <Text style={{ fontSize: 12, color: c.muted }}>貴社対応事項（任意）</Text>
                  <TextInput value={theirAction} onChangeText={setTheirAction} placeholder="例: ご確認をお願いいたします" placeholderTextColor={c.muted} multiline
                    style={[st.input, { color: c.foreground, backgroundColor: c.background, borderColor: c.border, minHeight: 60, textAlignVertical: "top" }]} />
                </View>
              </>
            )}
          </View>
        )}

        {/* 返信シーン: 分岐選択UI */}
        {scene === "reply" && (
          <View style={[st.card, { backgroundColor: c.surface, borderColor: c.border, gap: 10 }]}>
            <Text style={{ fontSize: 14, fontWeight: "700", color: c.foreground, marginBottom: 4 }}>状況を選んでください</Text>
            <View style={{ gap: 8 }}>
              {REPLY_SUBTYPES.map(sub => {
                const isSelected = replySubtype === sub.id;
                return (
                  <Pressable
                    key={sub.id}
                    style={({ pressed }) => [st.row, {
                      gap: 12, padding: 12, borderRadius: 12, borderWidth: 2,
                      borderColor: isSelected ? c.primary : c.border,
                      backgroundColor: isSelected ? c.tealLight : c.background,
                    }, pressed && { opacity: 0.7 }]}
                    onPress={() => { setReplySubtype(sub.id); setGenerated(null); }}
                  >
                    <IconSymbol name={sub.icon as any} size={20} color={isSelected ? c.primary : c.muted} />
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: 14, fontWeight: "700", color: isSelected ? c.primary : c.foreground }}>{sub.label}</Text>
                      <Text style={{ fontSize: 12, color: c.muted }}>{sub.desc}</Text>
                    </View>
                    {isSelected && <IconSymbol name="checkmark.circle.fill" size={18} color={c.primary} />}
                  </Pressable>
                );
              })}
            </View>

            {/* 日程確定時: 確定日時入力 */}
            {replySubtype === "confirmed" && (
              <View style={{ gap: 6, marginTop: 4 }}>
                <Text style={{ fontSize: 13, fontWeight: "700", color: c.foreground }}>確定日時（任意）</Text>
                <TextInput
                  value={confirmedDate}
                  onChangeText={setConfirmedDate}
                  placeholder="例: 3月10日（月） 10:00～11:00"
                  placeholderTextColor={c.muted}
                  style={[st.input, { color: c.foreground, backgroundColor: c.background, borderColor: c.border }]}
                />
              </View>
            )}

            {/* 別候補依頼・日程変更時: 新候補日程入力 */}
            {(replySubtype === "reschedule" || replySubtype === "change_request") && (
              <View style={{ gap: 6, marginTop: 4 }}>
                <Text style={{ fontSize: 13, fontWeight: "700", color: c.foreground }}>候補日程（任意）</Text>
                <Text style={{ fontSize: 12, color: c.muted }}>検索タブから転送、または直接入力</Text>
                <TextInput
                  value={newScheduleText}
                  onChangeText={setNewScheduleText}
                  placeholder={`例:\n● 3月10日（月） 10:00～11:00\n● 3月11日（火） 14:00～15:00`}
                  placeholderTextColor={c.muted}
                  multiline
                  style={[st.input, {
                    color: c.foreground,
                    backgroundColor: c.background,
                    borderColor: newScheduleText ? c.primary : c.border,
                    minHeight: 80,
                    textAlignVertical: "top",
                    lineHeight: 22,
                  }]}
                />
              </View>
            )}
          </View>
        )}

        {/* 次回案内シーン: 日程貼り付けエリア */}
        {scene === "next" && (
          <View style={[st.card, { backgroundColor: c.surface, borderColor: c.border, gap: 10 }]}>
            <View style={[st.row, { justifyContent: "space-between" }]}>
              <View>
                <Text style={{ fontSize: 14, fontWeight: "700", color: c.foreground }}>日程候補</Text>
                <Text style={{ fontSize: 12, color: c.muted, marginTop: 2 }}>検索タブの結果から転送、または直接入力</Text>
              </View>
              {scheduleText.length > 0 && (
                <Pressable
                  style={({ pressed }) => [{ paddingHorizontal: 10, paddingVertical: 5, borderRadius: 12, backgroundColor: c.tealLight }, pressed && { opacity: 0.7 }]}
                  onPress={() => setScheduleText("")}
                >
                  <Text style={{ fontSize: 12, color: c.primary }}>クリア</Text>
                </Pressable>
              )}
            </View>
            <TextInput
              value={scheduleText}
              onChangeText={setScheduleText}
              placeholder={`例:\n● 3月10日（月） 10:00〜11:00\n● 3月11日（火） 14:00〜15:00`}
              placeholderTextColor={c.muted}
              multiline
              style={[st.input, {
                color: c.foreground,
                backgroundColor: c.background,
                borderColor: scheduleText ? c.primary : c.border,
                minHeight: 100,
                textAlignVertical: "top",
                lineHeight: 22,
              }]}
            />
            {scheduleText.length > 0 && (
              <View style={[st.row, { gap: 6 }]}>
                <IconSymbol name="checkmark.circle.fill" size={14} color={c.success} />
                <Text style={{ fontSize: 12, color: c.success }}>日程候補が入力されています</Text>
              </View>
            )}
          </View>
        )}

        {/* 生成ボタン */}
        <View style={{ paddingHorizontal: 16, marginBottom: 12 }}>
          <Pressable
            style={({ pressed }) => [{
              backgroundColor: c.primary, borderRadius: 16, paddingVertical: 16,
              alignItems: "center", justifyContent: "center",
            }, pressed && { opacity: 0.8 }]}
            onPress={handleGenerate}
          >
            <Text style={{ fontSize: 16, fontWeight: "800", color: "#fff" }}>文章を生成する</Text>
          </Pressable>
        </View>

        {/* 生成結果 */}
        {generated !== null && (
          <View style={[st.card, { backgroundColor: c.surface, borderColor: c.border }]}>
            <View style={[st.row, { justifyContent: "space-between", marginBottom: 12 }]}>
              <View style={st.row}>
                <Text style={{ fontSize: 14, fontWeight: "600", color: c.muted }}>生成メッセージ</Text>
                {editedMessage !== null && (
                  <View style={{ marginLeft: 8, backgroundColor: c.warning, borderRadius: 8, paddingHorizontal: 6, paddingVertical: 2 }}>
                    <Text style={{ fontSize: 10, color: "#fff", fontWeight: "700" }}>編集済</Text>
                  </View>
                )}
              </View>
              <View style={[st.row, { gap: 8 }]}>
                <Pressable
                  style={({ pressed }) => [st.row, { gap: 4, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 20, backgroundColor: isEditing ? c.primary : c.tealLight }, pressed && { opacity: 0.7 }]}
                  onPress={() => {
                    if (isEditing) {
                      setIsEditing(false);
                    } else {
                      if (editedMessage === null) setEditedMessage(generated);
                      setIsEditing(true);
                    }
                  }}
                >
                  <IconSymbol name={isEditing ? "checkmark" : "pencil"} size={14} color={isEditing ? "#fff" : c.primary} />
                  <Text style={{ fontSize: 13, color: isEditing ? "#fff" : c.primary, fontWeight: "600" }}>{isEditing ? "確定" : "編集"}</Text>
                </Pressable>
                {editedMessage !== null && !isEditing && (
                  <Pressable
                    style={({ pressed }) => [{ paddingHorizontal: 8, paddingVertical: 6, borderRadius: 20, backgroundColor: c.tealLight }, pressed && { opacity: 0.7 }]}
                    onPress={() => { setEditedMessage(null); setIsEditing(false); }}
                  >
                    <Text style={{ fontSize: 12, color: c.muted }}>リセット</Text>
                  </Pressable>
                )}
                <Pressable
                  style={({ pressed }) => [st.row, { gap: 4, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20, backgroundColor: copied ? c.success : c.primary }, pressed && { opacity: 0.8 }]}
                  onPress={handleCopy}
                >
                  <IconSymbol name="doc.on.doc" size={16} color="#fff" />
                  <Text style={{ fontSize: 13, color: "#fff", fontWeight: "700" }}>{copied ? "コピー済！" : "コピー"}</Text>
                </Pressable>
              </View>
            </View>
            {isEditing ? (
              <TextInput
                value={editedMessage ?? generated}
                onChangeText={setEditedMessage}
                multiline
                style={[st.input, { color: c.foreground, backgroundColor: c.background, borderColor: c.primary, minHeight: 200, textAlignVertical: "top", lineHeight: 22, fontSize: 14 }]}
                autoFocus
              />
            ) : (
              <View style={{ backgroundColor: c.background, borderRadius: 12, padding: 14, borderWidth: 1, borderColor: c.border }}>
                <Text style={{ fontSize: 14, color: c.foreground, lineHeight: 22 }}>{displayMessage}</Text>
              </View>
            )}
          </View>
        )}

      </ScrollView>

      {/* プロフィールカード編集モーダル */}
      <CardEditor
        visible={editorVisible}
        isEditing={!!editingCard}
        initial={editingCard ? { label: editingCard.label, name: editingCard.name, company: editingCard.company ?? "", role: editingCard.role ?? "" } : undefined}
        onCancel={() => { setEditorVisible(false); setEditingCard(null); }}
        onSave={(data) => {
          if (editingCard) {
            updateCard.mutate({ id: editingCard.id, ...data });
          } else {
            createCard.mutate({ ...data, sortOrder: cards.length });
          }
          setEditingCard(null);
          setEditorVisible(false);
        }}
        colors={c}
      />
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
