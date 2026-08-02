import "client-only";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let browserClient: SupabaseClient | null | undefined;

export function getSupabaseBrowserClient(): SupabaseClient | null {
  if (browserClient !== undefined) return browserClient;

  const enabled = process.env.NEXT_PUBLIC_SUPABASE_REALTIME_ENABLED === "true";
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  if (!enabled || !url || !publishableKey) {
    browserClient = null;
    return browserClient;
  }

  browserClient = createClient(url, publishableKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false,
    },
  });

  return browserClient;
}
