function getRequiredEnv(key: string): string {
  const value = process.env[key];
  if (!value || value.trim() === "") {
    throw new Error(
      `[Startup Error] Missing required environment variable: ${key}. Please check your .env.local file.`
    );
  }
  return value;
}

function getOptionalEnv(key: string, defaultValue = ""): string {
  return process.env[key] || defaultValue;
}

export const env = {
  // Clerk
  NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: getRequiredEnv("NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY"),
  CLERK_SECRET_KEY: getRequiredEnv("CLERK_SECRET_KEY"),
  NEXT_PUBLIC_CLERK_SIGN_IN_URL: getOptionalEnv("NEXT_PUBLIC_CLERK_SIGN_IN_URL", "/sign-in"),
  NEXT_PUBLIC_CLERK_SIGN_UP_URL: getOptionalEnv("NEXT_PUBLIC_CLERK_SIGN_UP_URL", "/sign-up"),

  // Supabase (required for database client to carry auth tokens)
  NEXT_PUBLIC_SUPABASE_URL: getRequiredEnv("NEXT_PUBLIC_SUPABASE_URL"),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: getRequiredEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY"),
};