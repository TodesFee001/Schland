import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";

import { getSupabasePublishableKey } from "@/lib/env";

type UntypedSupabaseDatabase = {
  public: {
    Functions: Record<
      string,
      {
        Args: Record<string, unknown>;
        Returns: unknown;
      }
    >;
    Tables: Record<
      string,
      {
        Insert: Record<string, unknown>;
        Relationships: [];
        Row: Record<string, unknown>;
        Update: Record<string, unknown>;
      }
    >;
    Views: Record<
      string,
      {
        Relationships: [];
        Row: Record<string, unknown>;
      }
    >;
  };
};

let adminClient: ReturnType<typeof createClient<UntypedSupabaseDatabase>> | null =
  null;

export async function createSupabaseServerClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publishableKey = getSupabasePublishableKey();

  if (!supabaseUrl || !publishableKey) {
    throw new Error("Supabase browser credentials are not configured.");
  }

  const cookieStore = await cookies();

  return createServerClient(supabaseUrl, publishableKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => {
            cookieStore.set(name, value, options);
          });
        } catch {
          // Server Components cannot always write cookies; proxy and actions can.
        }
      },
    },
  });
}

export function getSupabaseAdminClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("Supabase server credentials are not configured.");
  }

  if (!adminClient) {
    adminClient = createClient<UntypedSupabaseDatabase>(
      supabaseUrl,
      serviceRoleKey,
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
      },
    );
  }

  return adminClient;
}
