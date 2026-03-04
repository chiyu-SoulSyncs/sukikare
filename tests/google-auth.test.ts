import { describe, it, expect } from "vitest";

describe("Google OAuth credentials", () => {
  it("GOOGLE_CLIENT_ID is set and has correct format", () => {
    const clientId = process.env.GOOGLE_CLIENT_ID;
    expect(clientId).toBeDefined();
    expect(clientId).toMatch(/\.apps\.googleusercontent\.com$/);
  });

  it("GOOGLE_CLIENT_SECRET is set and has correct format", () => {
    const secret = process.env.GOOGLE_CLIENT_SECRET;
    expect(secret).toBeDefined();
    expect(secret!.length).toBeGreaterThan(10);
  });
});
