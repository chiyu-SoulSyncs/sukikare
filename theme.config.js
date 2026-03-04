/** @type {const} */
const themeColors = {
  // ティール系メインカラー（ムードボード参照）
  primary: { light: '#00BFA5', dark: '#00BFA5' },
  // アクセント：イエロー
  accent: { light: '#FFD54F', dark: '#FFD54F' },
  // 背景
  background: { light: '#F4FAFA', dark: '#0F1F1F' },
  surface: { light: '#FFFFFF', dark: '#1A2E2E' },
  // テキスト
  foreground: { light: '#1A2E2E', dark: '#F0FAFA' },
  muted: { light: '#6B8E8E', dark: '#8ABABA' },
  // ボーダー
  border: { light: '#D0ECEC', dark: '#2A4444' },
  // ステータス
  success: { light: '#26C6A2', dark: '#26C6A2' },
  warning: { light: '#FFD54F', dark: '#FFD54F' },
  error: { light: '#EF5350', dark: '#EF9A9A' },
  // ティール薄め（カード背景など）
  tealLight: { light: '#E0F5F3', dark: '#1A3838' },
  // セカンダリティール（深め）
  tealDark: { light: '#00897B', dark: '#00BFA5' },
};

module.exports = { themeColors };
