import { createBrowserClient } from "@supabase/ssr";

import { getSupabasePublishableKey } from "@/lib/env";

export function createSupabaseBrowserClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publishableKey = getSupabasePublishableKey();

  if (!supabaseUrl || !publishableKey) {
    throw new Error("Supabase browser credentials are not configured.");
  }

  return createBrowserClient(supabaseUrl, publishableKey);
}
