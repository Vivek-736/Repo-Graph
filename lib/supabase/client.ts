import { createClient, SupabaseClient } from "@supabase/supabase-js";

export function createBrowserDatabaseClient(
  getToken?: () => Promise<string | null>
): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";

  return createClient(
    url,
    anonKey,
    {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
      accessToken: getToken
        ? async () => {
            try {
              return await getToken();
            } catch {
              return null;
            }
          }
        : undefined,
    }
  );
}