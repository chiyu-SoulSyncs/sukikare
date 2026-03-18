import React from "react";
import { View, Text, ScrollView, StyleSheet } from "react-native";
import { ScreenContainer } from "@/components/screen-container";
import { useColors } from "@/hooks/use-colors";

type SectionProps = {
  title: string;
  children: React.ReactNode;
  colors: ReturnType<typeof useColors>;
};

function Section({ title, children, colors: c }: SectionProps) {
  return (
    <View style={[st.card, { backgroundColor: c.surface, borderColor: c.border }]}>
      <Text style={{ fontSize: 16, fontWeight: "800", color: c.primary, marginBottom: 10 }}>{title}</Text>
      {children}
    </View>
  );
}

function P({ children, colors: c }: { children: React.ReactNode; colors: ReturnType<typeof useColors> }) {
  return <Text style={{ fontSize: 13, color: c.foreground, lineHeight: 20, marginBottom: 8 }}>{children}</Text>;
}

function Step({ num, text, colors: c }: { num: number; text: string; colors: ReturnType<typeof useColors> }) {
  return (
    <View style={[st.row, { gap: 10, marginBottom: 8 }]}>
      <View style={{ width: 24, height: 24, borderRadius: 12, backgroundColor: c.primary, alignItems: "center", justifyContent: "center" }}>
        <Text style={{ fontSize: 12, fontWeight: "800", color: "#fff" }}>{num}</Text>
      </View>
      <Text style={{ fontSize: 13, color: c.foreground, lineHeight: 20, flex: 1 }}>{text}</Text>
    </View>
  );
}

export default function HelpScreen() {
  const c = useColors();

  return (
    <ScreenContainer containerClassName="bg-background">
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 40 }}>
        <View style={{ paddingHorizontal: 20, paddingTop: 16, paddingBottom: 8 }}>
          <Text style={{ fontSize: 26, fontWeight: "800", color: c.foreground }}>使い方ガイド</Text>
          <Text style={{ fontSize: 14, color: c.muted, marginTop: 4 }}>スキカレの機能と使い方</Text>
        </View>

        {/* はじめに */}
        <Section title="スキカレとは？" colors={c}>
          <P colors={c}>スキカレは、ビジネスシーンでの挨拶文を簡単に作成できるアプリです。Googleカレンダーと連携して、空き時間の検索や会議のリマインドも行えます。</P>
        </Section>

        {/* 初期設定 */}
        <Section title="初期設定" colors={c}>
          <P colors={c}>アプリを使い始めるために、以下の設定を行ってください。</P>
          <Step num={1} text="「設定」タブからGoogleアカウントでログインします。" colors={c} />
          <Step num={2} text="Googleカレンダーを連携します（設定タブ → 「カレンダーを連携する」）。" colors={c} />
          <Step num={3} text="使用するカレンダーを選択します（複数選択可能）。" colors={c} />
          <Step num={4} text="「挨拶文」タブでプロフィールカードを作成します（「＋追加」ボタン）。" colors={c} />
        </Section>

        {/* 挨拶文メーカー */}
        <Section title="挨拶文メーカー" colors={c}>
          <P colors={c}>ビジネスシーンに応じた挨拶文を自動生成します。</P>

          <Text style={{ fontSize: 14, fontWeight: "700", color: c.foreground, marginTop: 4, marginBottom: 6 }}>プロフィールカード</Text>
          <P colors={c}>名前・会社名・役職を登録したカードです。複数作成でき、シーンに合わせて切り替えられます。選択中のカードをタップすると編集・削除ができます。</P>

          <Text style={{ fontSize: 14, fontWeight: "700", color: c.foreground, marginTop: 4, marginBottom: 6 }}>シーン（5種類）</Text>
          <View style={{ marginBottom: 8 }}>
            {[
              { label: "自己紹介", desc: "グループ参加時の挨拶" },
              { label: "ミーティングお礼", desc: "打ち合わせ後のお礼メッセージ" },
              { label: "リマインド", desc: "会議前の確認連絡（カレンダーから予定を選択可能）" },
              { label: "次回案内", desc: "日程調整の依頼（検索タブの結果を転送可能）" },
              { label: "返信", desc: "日程確定・別候補・辞退など状況に応じた返信" },
            ].map((item, i) => (
              <View key={i} style={{ marginBottom: 6 }}>
                <Text style={{ fontSize: 13, fontWeight: "600", color: c.primary }}>{item.label}</Text>
                <Text style={{ fontSize: 12, color: c.muted }}>{item.desc}</Text>
              </View>
            ))}
          </View>

          <Text style={{ fontSize: 14, fontWeight: "700", color: c.foreground, marginTop: 4, marginBottom: 6 }}>トーン（3種類）</Text>
          <View style={{ marginBottom: 8 }}>
            {[
              { label: "ビジネス丁寧語", desc: "お客様・取引先向けの正式な敬語" },
              { label: "カジュアル", desc: "社内・親しい関係向けの丁寧語" },
              { label: "タメ口", desc: "フラットな関係向けのカジュアルな表現" },
            ].map((item, i) => (
              <View key={i} style={{ marginBottom: 6 }}>
                <Text style={{ fontSize: 13, fontWeight: "600", color: c.primary }}>{item.label}</Text>
                <Text style={{ fontSize: 12, color: c.muted }}>{item.desc}</Text>
              </View>
            ))}
          </View>

          <Text style={{ fontSize: 14, fontWeight: "700", color: c.foreground, marginTop: 4, marginBottom: 6 }}>使い方</Text>
          <Step num={1} text="プロフィールカードを選択します。" colors={c} />
          <Step num={2} text="シーンを選びます（自己紹介、お礼など）。" colors={c} />
          <Step num={3} text="トーンを選びます（丁寧語、カジュアルなど）。" colors={c} />
          <Step num={4} text="必要に応じて会議情報を入力します。リマインドでは「カレンダーから選択」で自動入力できます。" colors={c} />
          <Step num={5} text="「文章を生成する」ボタンを押します。" colors={c} />
          <Step num={6} text="生成された文章は「コピー」ボタンでクリップボードにコピーできます。「編集」ボタンで直接修正も可能です。" colors={c} />
        </Section>

        {/* 検索 */}
        <Section title="空き時間検索" colors={c}>
          <P colors={c}>Googleカレンダーの予定から空き時間を自動検索し、日程候補を生成します。</P>
          <Step num={1} text="「検索」タブを開きます。" colors={c} />
          <Step num={2} text="検索する日付範囲を選択します。" colors={c} />
          <Step num={3} text="検索条件を設定します（時間帯、最小時間など）。" colors={c} />
          <Step num={4} text="「検索」ボタンで空き時間を検索します。" colors={c} />
          <Step num={5} text="結果から候補を選択し、「挨拶文に転送」で次回案内の文章に組み込めます。" colors={c} />
        </Section>

        {/* 設定 */}
        <Section title="設定" colors={c}>
          <View style={{ marginBottom: 8 }}>
            {[
              { label: "Googleカレンダー連携", desc: "カレンダーの接続・解除、使用するカレンダーの選択" },
              { label: "除外する曜日", desc: "空き時間検索で除外する曜日を設定" },
              { label: "除外する時間帯", desc: "昼休みなど検索から除外する時間帯を追加" },
              { label: "ログアウト", desc: "ページ最下部からログアウトできます" },
            ].map((item, i) => (
              <View key={i} style={{ marginBottom: 6 }}>
                <Text style={{ fontSize: 13, fontWeight: "600", color: c.primary }}>{item.label}</Text>
                <Text style={{ fontSize: 12, color: c.muted }}>{item.desc}</Text>
              </View>
            ))}
          </View>
        </Section>

        {/* Tips */}
        <Section title="便利な使い方" colors={c}>
          <View style={{ marginBottom: 8 }}>
            {[
              "リマインドシーンでは「カレンダーから選択」ボタンで、件名・日時・場所・URLが一括入力されます。",
              "返信シーンでは「かしこまりました」と「承知いたしました」の使い分けガイドが「？」アイコンから確認できます。",
              "生成した文章は「編集」ボタンで自由に修正できます。修正後も「コピー」で取得できます。",
              "プロフィールカードは複数作成でき、プロジェクトや役割ごとに切り替えて使えます。",
            ].map((tip, i) => (
              <View key={i} style={[st.row, { gap: 8, marginBottom: 8, alignItems: "flex-start" }]}>
                <Text style={{ fontSize: 13, color: c.primary, fontWeight: "700" }}>+</Text>
                <Text style={{ fontSize: 13, color: c.foreground, lineHeight: 20, flex: 1 }}>{tip}</Text>
              </View>
            ))}
          </View>
        </Section>

      </ScrollView>
    </ScreenContainer>
  );
}

const st = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center" },
  card: { marginHorizontal: 16, marginBottom: 12, borderRadius: 18, padding: 16, borderWidth: 1 },
});
