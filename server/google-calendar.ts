import type { Express, Request, Response } from "express";

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID!;
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET!;
const REDIRECT_URI = process.env.GOOGLE_REDIRECT_URI || 
  "https://3000-iql0v1fyldeesdziiefu8-8a69bc03.sg1.manus.computer/api/oauth/google/callback";

const SCOPES = [
  "https://www.googleapis.com/auth/calendar.readonly",
  "https://www.googleapis.com/auth/userinfo.email",
].join(" ");

// In-memory token store keyed by userId (for demo; in production use DB)
const tokenStore = new Map<string, { accessToken: string; refreshToken?: string; expiresAt: number }>();

export function getGoogleTokenForUser(userId: string) {
  return tokenStore.get(userId) ?? null;
}

export function setGoogleTokenForUser(
  userId: string,
  data: { accessToken: string; refreshToken?: string; expiresAt: number }
) {
  tokenStore.set(userId, data);
}

async function refreshAccessToken(refreshToken: string): Promise<{ accessToken: string; expiresAt: number } | null> {
  try {
    const res = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: GOOGLE_CLIENT_ID,
        client_secret: GOOGLE_CLIENT_SECRET,
        refresh_token: refreshToken,
        grant_type: "refresh_token",
      }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    return {
      accessToken: data.access_token,
      expiresAt: Date.now() + (data.expires_in ?? 3600) * 1000,
    };
  } catch {
    return null;
  }
}

export async function getValidAccessToken(userId: string): Promise<string | null> {
  const stored = tokenStore.get(userId);
  if (!stored) return null;

  // If token is still valid (with 60s buffer), return it
  if (stored.expiresAt - 60_000 > Date.now()) {
    return stored.accessToken;
  }

  // Try to refresh
  if (stored.refreshToken) {
    const refreshed = await refreshAccessToken(stored.refreshToken);
    if (refreshed) {
      tokenStore.set(userId, { ...stored, ...refreshed });
      return refreshed.accessToken;
    }
  }

  return null;
}

export function registerGoogleCalendarRoutes(app: Express) {
  // Start Google OAuth flow
  app.get("/api/oauth/google/start", (req: Request, res: Response) => {
    const userId = (req as any).userId || req.query.userId as string;
    const state = Buffer.from(JSON.stringify({ userId, ts: Date.now() })).toString("base64url");

    const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
    url.searchParams.set("client_id", GOOGLE_CLIENT_ID);
    url.searchParams.set("redirect_uri", REDIRECT_URI);
    url.searchParams.set("response_type", "code");
    url.searchParams.set("scope", SCOPES);
    url.searchParams.set("access_type", "offline");
    url.searchParams.set("prompt", "consent");
    url.searchParams.set("state", state);

    res.json({ url: url.toString() });
  });

  // Google OAuth callback
  app.get("/api/oauth/google/callback", async (req: Request, res: Response) => {
    const code = req.query.code as string;
    const state = req.query.state as string;

    if (!code || !state) {
      res.status(400).json({ error: "code and state required" });
      return;
    }

    try {
      const stateData = JSON.parse(Buffer.from(state, "base64url").toString());
      const userId = stateData.userId as string;

      // Exchange code for tokens
      const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          code,
          client_id: GOOGLE_CLIENT_ID,
          client_secret: GOOGLE_CLIENT_SECRET,
          redirect_uri: REDIRECT_URI,
          grant_type: "authorization_code",
        }),
      });

      if (!tokenRes.ok) {
        const err = await tokenRes.text();
        console.error("[Google OAuth] Token exchange failed:", err);
        res.status(500).json({ error: "Token exchange failed" });
        return;
      }

      const tokenData = await tokenRes.json();
      setGoogleTokenForUser(userId, {
        accessToken: tokenData.access_token,
        refreshToken: tokenData.refresh_token,
        expiresAt: Date.now() + (tokenData.expires_in ?? 3600) * 1000,
      });

      // Redirect back to app
      const frontendUrl =
        process.env.EXPO_WEB_PREVIEW_URL ||
        process.env.EXPO_PACKAGER_PROXY_URL ||
        "http://localhost:8081";
      res.redirect(302, `${frontendUrl}?googleConnected=true`);
    } catch (error) {
      console.error("[Google OAuth] Callback error:", error);
      res.status(500).json({ error: "OAuth callback failed" });
    }
  });

  // Check Google connection status
  app.get("/api/google/status", async (req: Request, res: Response) => {
    const userId = req.query.userId as string;
    if (!userId) {
      res.json({ connected: false });
      return;
    }
    const token = await getValidAccessToken(userId);
    res.json({ connected: !!token });
  });

  // Get list of calendars
  app.get("/api/google/calendars", async (req: Request, res: Response) => {
    const userId = req.query.userId as string;
    if (!userId) {
      res.status(401).json({ error: "userId required" });
      return;
    }

    const accessToken = await getValidAccessToken(userId);
    if (!accessToken) {
      res.status(401).json({ error: "Google not connected", needsAuth: true });
      return;
    }

    try {
      const calRes = await fetch(
        "https://www.googleapis.com/calendar/v3/users/me/calendarList",
        { headers: { Authorization: `Bearer ${accessToken}` } }
      );
      if (!calRes.ok) {
        res.status(calRes.status).json({ error: "Failed to fetch calendars" });
        return;
      }
      const data = await calRes.json();
      res.json({ calendars: data.items ?? [] });
    } catch (error) {
      console.error("[Google Calendar] List calendars error:", error);
      res.status(500).json({ error: "Failed to fetch calendars" });
    }
  });

  // Get events for specified date range
  app.get("/api/google/events", async (req: Request, res: Response) => {
    const userId = req.query.userId as string;
    const calendarIds = req.query.calendarIds as string; // comma-separated
    const timeMin = req.query.timeMin as string;
    const timeMax = req.query.timeMax as string;

    if (!userId || !timeMin || !timeMax) {
      res.status(400).json({ error: "userId, timeMin, timeMax required" });
      return;
    }

    const accessToken = await getValidAccessToken(userId);
    if (!accessToken) {
      res.status(401).json({ error: "Google not connected", needsAuth: true });
      return;
    }

    const ids = calendarIds ? calendarIds.split(",") : ["primary"];

    try {
      const allEvents: any[] = [];

      for (const calId of ids) {
        const url = new URL(`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calId)}/events`);
        url.searchParams.set("timeMin", timeMin);
        url.searchParams.set("timeMax", timeMax);
        url.searchParams.set("singleEvents", "true");
        url.searchParams.set("orderBy", "startTime");
        url.searchParams.set("maxResults", "250");

        const evRes = await fetch(url.toString(), {
          headers: { Authorization: `Bearer ${accessToken}` },
        });

        if (evRes.ok) {
          const data = await evRes.json();
          allEvents.push(...(data.items ?? []));
        }
      }

      res.json({ events: allEvents });
    } catch (error) {
      console.error("[Google Calendar] Fetch events error:", error);
      res.status(500).json({ error: "Failed to fetch events" });
    }
  });

  // Disconnect Google
  app.post("/api/google/disconnect", (req: Request, res: Response) => {
    const { userId } = req.body;
    if (userId) tokenStore.delete(userId);
    res.json({ success: true });
  });
}
