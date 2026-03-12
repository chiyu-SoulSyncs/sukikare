import * as ReactNative from "react-native";
import * as WebBrowser from "expo-web-browser";

export const SESSION_TOKEN_KEY = "app_session_token";
export const USER_INFO_KEY = "calmate-user-info";

/**
 * Get the API base URL, deriving from current hostname if not set.
 * Metro runs on 8081, API server runs on 3000.
 */
export function getApiBaseUrl(): string {
  const envUrl = process.env.EXPO_PUBLIC_API_BASE_URL;
  if (envUrl) {
    return envUrl.replace(/\/$/, "");
  }

  // On web, derive from current location by replacing port with 3000
  if (ReactNative.Platform.OS === "web" && typeof window !== "undefined" && window.location) {
    const { protocol, hostname, port } = window.location;
    if (port === "8081") {
      return `${protocol}//${hostname}:3000`;
    }
  }

  // Fallback to empty (will use relative URL)
  return "";
}

/**
 * Get the Google OAuth login URL (server-side endpoint).
 */
export function getGoogleLoginUrl(apiBaseUrl: string): string {
  return `${apiBaseUrl}/api/oauth/google/login`;
}

/**
 * Start Google OAuth login flow.
 *
 * On web: redirects to the server's Google OAuth endpoint.
 * On native: uses expo-web-browser openAuthSessionAsync with calmate:// deep link scheme.
 *
 * @returns { sessionToken, userBase64 } on native success, null otherwise.
 */
export async function startGoogleLogin(): Promise<{
  sessionToken: string;
  userBase64: string | null;
} | null> {
  const loginUrl = getGoogleLoginUrl(getApiBaseUrl());

  if (ReactNative.Platform.OS === "web") {
    // On web, just redirect
    if (typeof window !== "undefined") {
      window.location.href = loginUrl;
    }
    return null;
  }

  // Native: use expo-web-browser to open the system browser for Google OAuth
  try {
    const redirectUri = "calmate://oauth/callback";
    const result = await WebBrowser.openAuthSessionAsync(loginUrl, redirectUri);

    if (result.type === "success" && result.url) {
      // Parse sessionToken and user from the deep link URL
      // URL format: calmate://oauth/callback?sessionToken=...&user=...
      try {
        const url = new URL(result.url);
        const sessionToken = url.searchParams.get("sessionToken");
        const userBase64 = url.searchParams.get("user");
        if (sessionToken) {
          return { sessionToken, userBase64 };
        }
      } catch (parseError) {
        if (__DEV__) console.error("[OAuth] Failed to parse result URL:", parseError);
      }
    }
  } catch (error) {
    if (__DEV__) console.error("[OAuth] Failed to open login URL:", error);
  }

  return null;
}
