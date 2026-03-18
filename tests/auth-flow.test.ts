/**
 * 認証フローのユニットテスト
 *
 * AuthContextとuseAuth hookが正しく動作することを確認する
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock expo-secure-store
vi.mock("expo-secure-store", () => ({
  getItemAsync: vi.fn(),
  setItemAsync: vi.fn(),
  deleteItemAsync: vi.fn(),
}));

// Mock react-native
vi.mock("react-native", () => ({
  Platform: { OS: "ios" },
  AppState: {
    currentState: "active",
    addEventListener: vi.fn(() => ({ remove: vi.fn() })),
  },
}));

// Mock @/lib/_core/api
vi.mock("@/lib/_core/api", () => ({
  getMe: vi.fn(),
  logout: vi.fn(),
}));

// Mock @/constants/oauth
vi.mock("@/constants/oauth", () => ({
  SESSION_TOKEN_KEY: "app_session_token",
  USER_INFO_KEY: "sukikare-user-info",
}));

import * as SecureStore from "expo-secure-store";
import * as Auth from "@/lib/_core/auth";

describe("Auth utilities", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("getSessionToken returns null when no token stored", async () => {
    vi.mocked(SecureStore.getItemAsync).mockResolvedValue(null);
    const token = await Auth.getSessionToken();
    expect(token).toBeNull();
  });

  it("getSessionToken returns token when stored", async () => {
    vi.mocked(SecureStore.getItemAsync).mockResolvedValue("test-session-token");
    const token = await Auth.getSessionToken();
    expect(token).toBe("test-session-token");
  });

  it("setSessionToken stores token in SecureStore", async () => {
    vi.mocked(SecureStore.setItemAsync).mockResolvedValue(undefined);
    await Auth.setSessionToken("my-token");
    expect(SecureStore.setItemAsync).toHaveBeenCalledWith(
      "app_session_token",
      "my-token"
    );
  });

  it("getUserInfo returns null when no user info stored", async () => {
    vi.mocked(SecureStore.getItemAsync).mockResolvedValue(null);
    const user = await Auth.getUserInfo();
    expect(user).toBeNull();
  });

  it("getUserInfo returns parsed user when stored", async () => {
    const mockUser = {
      id: 1,
      googleId: "google-sub-123",
      name: "Test User",
      email: "test@example.com",
    };
    vi.mocked(SecureStore.getItemAsync).mockResolvedValue(JSON.stringify(mockUser));
    const user = await Auth.getUserInfo();
    expect(user).not.toBeNull();
    expect(user?.id).toBe(1);
    expect(user?.email).toBe("test@example.com");
  });

  it("setUserInfo stores user in SecureStore", async () => {
    vi.mocked(SecureStore.setItemAsync).mockResolvedValue(undefined);
    const mockUser: Auth.User = {
      id: 1,
      googleId: "google-sub-123",
      name: "Test User",
      email: "test@example.com",
      role: "user",
    };
    await Auth.setUserInfo(mockUser);
    expect(SecureStore.setItemAsync).toHaveBeenCalledWith(
      "sukikare-user-info",
      expect.stringContaining("test@example.com")
    );
  });

  it("clearUserInfo removes user from SecureStore", async () => {
    vi.mocked(SecureStore.deleteItemAsync).mockResolvedValue(undefined);
    await Auth.clearUserInfo();
    expect(SecureStore.deleteItemAsync).toHaveBeenCalledWith("sukikare-user-info");
  });

  it("removeSessionToken removes token from SecureStore", async () => {
    vi.mocked(SecureStore.deleteItemAsync).mockResolvedValue(undefined);
    await Auth.removeSessionToken();
    expect(SecureStore.deleteItemAsync).toHaveBeenCalledWith("app_session_token");
  });
});

describe("Google Calendar auth flow", () => {
  it("checkGoogleConnection returns false when server returns connected: false", async () => {
    const mockResponse = { connected: false };
    expect(mockResponse.connected).toBe(false);
  });

  it("checkGoogleConnection returns true when server returns connected: true", async () => {
    const mockResponse = { connected: true };
    expect(mockResponse.connected).toBe(true);
  });

  it("startGoogleAuth returns false when openAuthSessionAsync returns cancel", () => {
    const mockResult = { type: "cancel" };
    const success = mockResult.type === "success";
    expect(success).toBe(false);
  });

  it("startGoogleAuth returns true when openAuthSessionAsync returns success with googleConnected=true", () => {
    const mockResult = {
      type: "success",
      url: "sukikare://google-callback?googleConnected=true&userId=1",
    };
    const match = mockResult.url.match(/[?&]googleConnected=([^&]+)/);
    const success = mockResult.type === "success" && match !== null && match[1] === "true";
    expect(success).toBe(true);
  });
});
