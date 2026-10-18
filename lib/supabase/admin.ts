import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { env } from "@/lib/env";

let adminClient: SupabaseClient | null = null;

/**
 * Returns a privileged Supabase client using SUPABASE_SECRET_KEY or SUPABASE_SERVICE_ROLE_KEY.
 * ONLY for server-side trusted operations (e.g. pipeline tasks, migrations).
 * NEVER expose this key to public or client-side code.
 */
export function createAdminDatabaseClient(): SupabaseClient | null {
  if (adminClient) {
    return adminClient;
  }

  const secretKey =
    process.env.SUPABASE_SECRET_KEY ||
    process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!secretKey || !env.hasSupabaseConfig()) {
    return null;
  }

  adminClient = createClient(env.NEXT_PUBLIC_SUPABASE_URL, secretKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });

  return adminClient;
}