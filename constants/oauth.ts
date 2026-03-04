import * as ReactNative from "react-native";
import * as WebBrowser from "expo-web-browser";

// Extract scheme from bundle ID (last segment timestamp, prefixed with "manus")
// e.g., "space.manus.my.app.t20240115103045" -> "manus20240115103045"
const bundleId = "space.manus.schedule.assistant.t20260304040150";
const timestamp = bundleId.split(".").pop()?.replace(/^t/, "") ?? "";
const schemeFromBundleId = `manus${timestamp}`;

const env = {
  portal: process.env.EXPO_PUBLIC_OAUTH_PORTAL_URL ?? "",
  server: process.env.EXPO_PUBLIC_OAUTH_SERVER_URL ?? "",
  appId: process.env.EXPO_PUBLIC_APP_ID ?? "",
  ownerId: process.env.EXPO_PUBLIC_OWNER_OPEN_ID ?? "",
  ownerName: process.env.EXPO_PUBLIC_OWNER_NAME ?? "",
  apiBaseUrl: process.env.EXPO_PUBLIC_API_BASE_URL ?? "",
  deepLinkScheme: schemeFromBundleId,
};

export const OAUTH_PORTAL_URL = env.portal;
export const OAUTH_SERVER_URL = env.server;
export const APP_ID = env.appId;
export const OWNER_OPEN_ID = env.ownerId;
export const OWNER_NAME = env.ownerName;
export const API_BASE_URL = env.apiBaseUrl;

/**
 * Get the API base URL, deriving from current hostname if not set.
 * Metro runs on 8081, API server runs on 3000.
 * URL pattern: https://PORT-sandboxid.region.domain
 */
export function getApiBaseUrl(): string {
  // If API_BASE_URL is set, use it
  if (API_BASE_URL) {
    return API_BASE_URL.replace(/\/$/, "");
  }

  // On web, derive from current hostname by replacing port 8081 with 3000
  if (ReactNative.Platform.OS === "web" && typeof window !== "undefined" && window.location) {
    const { protocol, hostname } = window.location;
    // Pattern: 8081-sandboxid.region.domain -> 3000-sandboxid.region.domain
    const apiHostname = hostname.replace(/^8081-/, "3000-");
    if (apiHostname !== hostname) {
      return `${protocol}//${apiHostname}`;
    }
  }

  // Fallback to empty (will use relative URL)
  return "";
}

export const SESSION_TOKEN_KEY = "app_session_token";
export const USER_INFO_KEY = "manus-runtime-user-info";

const encodeState = (value: string) => {
  if (typeof globalThis.btoa === "function") {
    return globalThis.btoa(value);
  }
  const BufferImpl = (globalThis as Record<string, any>).Buffer;
  if (BufferImpl) {
    return BufferImpl.from(value, "utf-8").toString("base64");
  }
  return value;
};

/**
 * Get the redirect URI for OAuth callback.
 * - Web: uses API server callback endpoint
 * - Native: ALSO uses API server callback endpoint (Manus OAuth requires http/https or manus*)
 *   but passes an appRedirect parameter so the server can redirect back to the app.
 *
 * NOTE: Expo Go uses exp:// scheme which is NOT allowed by Manus OAuth.
 * The manus* custom scheme IS allowed, but Manus OAuth portal redirects to the server first.
 * So we always use the server URL as redirectUri, and pass appRedirect separately.
 */
export const getRedirectUri = () => {
  // Both web and native use the server callback endpoint as the OAuth redirect URI
  // This is required because Manus OAuth only allows http/https/manus* schemes
  return `${getApiBaseUrl()}/api/oauth/callback`;
};

/**
 * Get the app deep link URI for native platforms.
 * After the server processes the OAuth callback, it redirects to this URI.
 */
export const getAppRedirectUri = () => {
  if (ReactNative.Platform.OS === "web") {
    return null; // Web doesn't need app redirect
  }
  // Use manus* custom scheme directly (not Linking.createURL which generates exp:// in Expo Go)
  return `${env.deepLinkScheme}://oauth/callback`;
};

export const getLoginUrl = () => {
  const redirectUri = getRedirectUri();

  // state must be base64(redirectUri) - this is what the SDK's decodeState() expects
  const state = encodeState(redirectUri);

  const url = new URL(`${OAUTH_PORTAL_URL}/app-auth`);
  url.searchParams.set("appId", APP_ID);
  url.searchParams.set("redirectUri", redirectUri);
  url.searchParams.set("state", state);
  url.searchParams.set("type", "signIn");

  return url.toString();
};

/**
 * Start OAuth login flow.
 *
 * On native platforms (iOS/Android), use expo-web-browser openAuthSessionAsync
 * to open the system browser. The server OAuth callback redirects to the manus*
 * deep link scheme. openAuthSessionAsync intercepts this URL and returns it as result.url.
 *
 * On web, this simply redirects to the login URL.
 *
 * @returns The session token if authentication succeeded, null otherwise.
 */
export async function startOAuthLogin(): Promise<{
  sessionToken: string;
  userBase64: string | null;
} | null> {
  const loginUrl = getLoginUrl();
  const appRedirectUri = getAppRedirectUri();

  if (ReactNative.Platform.OS === "web") {
    // On web, just redirect
    if (typeof window !== "undefined") {
      window.location.href = loginUrl;
    }
    return null;
  }

  // Native: expo-web-browserを使用してシステムブラウザで認証
  // サーバーがOAuth処理後、manus*ディープリンクにリダイレクト
  // openAuthSessionAsyncはそのURLを検知してブラウザを閉じ、result.urlに返す
  try {
    console.log("[OAuth] Opening login URL:", loginUrl);
    console.log("[OAuth] App redirect URI:", appRedirectUri);
    const result = await WebBrowser.openAuthSessionAsync(
      loginUrl,
      appRedirectUri ?? `${env.deepLinkScheme}://`,
    );
    console.log("[OAuth] WebBrowser result type:", result.type);

    if (result.type === "success" && result.url) {
      console.log("[OAuth] Result URL:", result.url);
      // Parse sessionToken and user from the deep link URL
      // URL format: manus20260304040150://oauth/callback?sessionToken=...&user=...
      try {
        const url = new URL(result.url);
        const sessionToken = url.searchParams.get("sessionToken");
        const userBase64 = url.searchParams.get("user");
        if (sessionToken) {
          console.log("[OAuth] Session token extracted from result URL");
          return { sessionToken, userBase64 };
        }
      } catch (parseError) {
        console.error("[OAuth] Failed to parse result URL:", parseError);
      }
    }
  } catch (error) {
    console.error("[OAuth] Failed to open login URL:", error);
  }

  return null;
}
