import { COOKIE_NAME, ONE_YEAR_MS } from "../../shared/const.js";
import { randomBytes } from "crypto";
import type { Express, Request, Response } from "express";
import { getUserByOpenId, upsertUser } from "../db";
import { getSessionCookieOptions } from "./cookies";
import { ENV } from "./env";
import { sdk } from "./sdk";

function getQueryParam(req: Request, key: string): string | undefined {
  const value = req.query[key];
  return typeof value === "string" ? value : undefined;
}

function buildUserResponse(
  user:
    | Awaited<ReturnType<typeof getUserByOpenId>>
    | {
        openId: string;
        name?: string | null;
        email?: string | null;
      },
) {
  return {
    id: (user as any)?.id ?? null,
    googleId: user?.openId ?? null,
    name: user?.name ?? null,
    email: user?.email ?? null,
  };
}

export function registerOAuthRoutes(app: Express) {
  // Start Google OAuth login flow
  app.get("/api/oauth/google/login", (req: Request, res: Response) => {
    const SCOPES = [
      "openid",
      "https://www.googleapis.com/auth/userinfo.email",
      "https://www.googleapis.com/auth/userinfo.profile",
    ].join(" ");

    // Generate random state to prevent CSRF
    const state = randomBytes(32).toString("hex");

    // Store state in a short-lived httpOnly cookie (10 minutes)
    // Use sameSite: "none" + secure for cross-site redirect from Google,
    // but fall back to "lax" + no secure for local HTTP development
    const cookieOptions = getSessionCookieOptions(req);
    const isSecure = cookieOptions.secure;
    res.cookie("google_oauth_state", state, {
      ...cookieOptions,
      sameSite: isSecure ? "none" : "lax",
      secure: isSecure,
      maxAge: 10 * 60 * 1000, // 10 minutes
    });

    const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
    url.searchParams.set("client_id", ENV.googleClientId);
    url.searchParams.set("redirect_uri", ENV.googleRedirectUri);
    url.searchParams.set("response_type", "code");
    url.searchParams.set("scope", SCOPES);
    url.searchParams.set("access_type", "offline");
    url.searchParams.set("prompt", "consent");
    url.searchParams.set("state", state);

    res.redirect(302, url.toString());
  });

  app.get("/api/oauth/callback", async (req: Request, res: Response) => {
    const code = getQueryParam(req, "code");
    const state = getQueryParam(req, "state");

    if (!code) {
      res.status(400).json({ error: "code is required" });
      return;
    }

    // Verify OAuth state parameter to prevent CSRF
    const { parse: parseCookieHeader } = await import("cookie");
    const cookies = parseCookieHeader(req.headers.cookie || "");
    const storedState = cookies["google_oauth_state"];

    if (!state || !storedState || state !== storedState) {
      // In local development, log the mismatch for debugging
      if (process.env.NODE_ENV === "development") {
        console.warn("[OAuth] State mismatch - query:", state, "cookie:", storedState, "cookies:", req.headers.cookie);
      }
      res.status(403).json({ error: "Invalid OAuth state parameter" });
      return;
    }

    // Clear the state cookie
    const stateCookieOptions = getSessionCookieOptions(req);
    res.clearCookie("google_oauth_state", { ...stateCookieOptions, maxAge: -1 });

    try {
      // Exchange authorization code for tokens with Google
      const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          code,
          client_id: ENV.googleClientId,
          client_secret: ENV.googleClientSecret,
          redirect_uri: ENV.googleRedirectUri,
          grant_type: "authorization_code",
        }),
      });

      if (!tokenRes.ok) {
        const err = await tokenRes.text();
        console.error("[OAuth] Google token exchange failed:", err);
        res.status(500).json({ error: "Token exchange failed" });
        return;
      }

      const tokenData = await tokenRes.json();

      // Get user info from Google
      const userinfoRes = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
        headers: { Authorization: `Bearer ${tokenData.access_token}` },
      });

      if (!userinfoRes.ok) {
        console.error("[OAuth] Failed to fetch Google userinfo");
        res.status(500).json({ error: "Failed to get user info" });
        return;
      }

      const userinfo = await userinfoRes.json();
      // userinfo contains: sub, name, email, picture, etc.
      const googleId = userinfo.sub as string;
      const name = (userinfo.name as string) || "";
      const email = (userinfo.email as string) || null;

      // Upsert user in DB using Google sub as openId
      const lastSignedIn = new Date();
      await upsertUser({
        openId: googleId,
        name: name || null,
        email,
        loginMethod: "google",
        lastSignedIn,
      });
      const user = await getUserByOpenId(googleId);

      // Create JWT session token
      const sessionToken = await sdk.createSessionToken(googleId, name, {
        expiresInMs: ONE_YEAR_MS,
      });

      const cookieOptions = getSessionCookieOptions(req);
      res.cookie(COOKIE_NAME, sessionToken, { ...cookieOptions, maxAge: ONE_YEAR_MS });

      // Determine if this is a web browser request (not native app).
      // Check for x-web-preview header, Referer from localhost:8081, or browser User-Agent
      const ua = req.headers["user-agent"] || "";
      const referer = req.headers["referer"] || "";
      const isWebBrowser =
        req.headers["x-web-preview"] !== undefined ||
        referer.includes("localhost:8081") ||
        (ua.includes("Mozilla") && !ua.includes("Expo"));

      const APP_SCHEME = "calmate";
      if (!isWebBrowser) {
        // Native app: redirect to calmate deep link
        const userBase64 = Buffer.from(JSON.stringify(buildUserResponse(user))).toString("base64");
        const deepLinkUrl = new URL(`${APP_SCHEME}://oauth/callback`);
        deepLinkUrl.searchParams.set("sessionToken", sessionToken);
        deepLinkUrl.searchParams.set("user", userBase64);
        res.redirect(302, deepLinkUrl.toString());
        return;
      }

      // Web browser: redirect to the frontend URL
      const frontendUrl =
        process.env.EXPO_WEB_PREVIEW_URL ||
        process.env.EXPO_PACKAGER_PROXY_URL ||
        "http://localhost:8081";
      res.redirect(302, frontendUrl);
    } catch (error) {
      console.error("[OAuth] Callback failed", error);
      res.status(500).json({ error: "OAuth callback failed" });
    }
  });

  app.post("/api/auth/logout", (req: Request, res: Response) => {
    const cookieOptions = getSessionCookieOptions(req);
    res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
    res.json({ success: true });
  });

  // Get current authenticated user - works with both cookie (web) and Bearer token (mobile)
  app.get("/api/auth/me", async (req: Request, res: Response) => {
    try {
      const user = await sdk.authenticateRequest(req);
      res.json({ user: buildUserResponse(user) });
    } catch (error) {
      console.error("[Auth] /api/auth/me failed:", error);
      res.status(401).json({ error: "Not authenticated", user: null });
    }
  });

  // Establish session cookie from Bearer token
  app.post("/api/auth/session", async (req: Request, res: Response) => {
    try {
      // Authenticate using Bearer token from Authorization header
      const user = await sdk.authenticateRequest(req);

      // Get the token from the Authorization header to set as cookie
      const authHeader = req.headers.authorization || req.headers.Authorization;
      if (typeof authHeader !== "string" || !authHeader.startsWith("Bearer ")) {
        res.status(400).json({ error: "Bearer token required" });
        return;
      }
      const token = authHeader.slice("Bearer ".length).trim();

      // Set cookie for this domain
      const cookieOptions = getSessionCookieOptions(req);
      res.cookie(COOKIE_NAME, token, { ...cookieOptions, maxAge: ONE_YEAR_MS });

      res.json({ success: true, user: buildUserResponse(user) });
    } catch (error) {
      console.error("[Auth] /api/auth/session failed:", error);
      res.status(401).json({ error: "Invalid token" });
    }
  });
}
