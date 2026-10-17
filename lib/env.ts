function getEnv(key: string, required = false): string {
  const value = process.env[key];
  if (required && (!value || value.trim() === "")) {
    throw new Error(
      `[Startup Error] Missing required environment variable: ${key}. Please check your .env.local file.`
    );
  }
  return value || "";
}

export const env = {
  // Clerk
  NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: getEnv("NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY", true),
  CLERK_SECRET_KEY: getEnv("CLERK_SECRET_KEY", true),
  NEXT_PUBLIC_CLERK_SIGN_IN_URL: getEnv("NEXT_PUBLIC_CLERK_SIGN_IN_URL") || "/sign-in",
  NEXT_PUBLIC_CLERK_SIGN_UP_URL: getEnv("NEXT_PUBLIC_CLERK_SIGN_UP_URL") || "/sign-up",

  // Supabase (lazy getters so missing values report cleanly rather than crashing module evaluation)
  get NEXT_PUBLIC_SUPABASE_URL(): string {
    return getEnv("NEXT_PUBLIC_SUPABASE_URL", true);
  },
  get NEXT_PUBLIC_SUPABASE_ANON_KEY(): string {
    return getEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", true);
  },

  hasSupabaseConfig(): boolean {
    return Boolean(
      process.env.NEXT_PUBLIC_SUPABASE_URL &&
      process.env.NEXT_PUBLIC_SUPABASE_URL.trim() !== "" &&
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY &&
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY.trim() !== ""
    );
  },
};