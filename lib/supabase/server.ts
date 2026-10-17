import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { auth } from "@clerk/nextjs/server";
import { env } from "@/lib/env";

/**
 * Creates a server-side Supabase client that carries the active Clerk JWT session token.
 * Sessions belong exclusively to Clerk (the identity provider).
 * The token travels with every request via Authorization: Bearer <token>
 * so Postgres RLS policies can read identity and organization claims.
 *
 * Returns null if Supabase environment variables have not been configured yet.
 */
export async function createServerDatabaseClient(): Promise<SupabaseClient | null> {
  if (!env.hasSupabaseConfig()) {
    return null;
  }

  const { getToken } = await auth();

  let token: string | null = null;
  try {
    token = await getToken({ template: "supabase" });
  } catch {
    token = null;
  }

  if (!token) {
    token = await getToken();
  }

  return createClient(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
      global: {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      },
    }
  );
}