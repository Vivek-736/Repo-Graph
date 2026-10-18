/**
 * Environment variables helper.
 * Uses direct static access (e.g. process.env.NEXT_PUBLIC_...) so Next.js / Turbopack
 * can inline NEXT_PUBLIC_ variables into client bundles at compile time.
 */
export const env = {
  // Clerk
  get NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY(): string {
    return process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY || "";
  },
  get CLERK_SECRET_KEY(): string {
    return process.env.CLERK_SECRET_KEY || "";
  },
  get NEXT_PUBLIC_CLERK_SIGN_IN_URL(): string {
    return process.env.NEXT_PUBLIC_CLERK_SIGN_IN_URL || "/sign-in";
  },
  get NEXT_PUBLIC_CLERK_SIGN_UP_URL(): string {
    return process.env.NEXT_PUBLIC_CLERK_SIGN_UP_URL || "/sign-up";
  },

  // Supabase
  get NEXT_PUBLIC_SUPABASE_URL(): string {
    return process.env.NEXT_PUBLIC_SUPABASE_URL || "";
  },
  get NEXT_PUBLIC_SUPABASE_ANON_KEY(): string {
    return process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";
  },

  hasSupabaseConfig(): boolean {
    return Boolean(
      process.env.NEXT_PUBLIC_SUPABASE_URL &&
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    );
  },
};