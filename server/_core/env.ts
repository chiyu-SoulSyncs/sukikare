// Validate JWT_SECRET at server startup (skip during test/build)
if (process.env.NODE_ENV !== "test" && !process.env.VITEST) {
  if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 16) {
    console.error("FATAL: JWT_SECRET must be set and at least 16 characters");
    process.exit(1);
  }
}

export const ENV = {
  cookieSecret: process.env.JWT_SECRET ?? "",
  databaseUrl: process.env.DATABASE_URL ?? "",
  ownerOpenId: process.env.OWNER_OPEN_ID ?? "",
  adminEmail: process.env.ADMIN_EMAIL ?? "",
  isProduction: process.env.NODE_ENV === "production",
  googleClientId: process.env.GOOGLE_CLIENT_ID ?? "",
  googleClientSecret: process.env.GOOGLE_CLIENT_SECRET ?? "",
  googleRedirectUri: process.env.GOOGLE_REDIRECT_URI ?? "",
  forgeApiUrl: process.env.BUILT_IN_FORGE_API_URL ?? "",
  forgeApiKey: process.env.BUILT_IN_FORGE_API_KEY ?? "",
};
