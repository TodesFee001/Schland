import { hasSupabasePublicEnv } from "@/lib/env";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type AuthStatus = {
  configured: boolean;
  signedIn: boolean;
  email?: string;
  mfaLevel?: string;
  userId?: string;
};

export async function getAuthStatus(): Promise<AuthStatus> {
  if (!hasSupabasePublicEnv()) {
    return {
      configured: false,
      signedIn: false,
    };
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return {
      configured: true,
      signedIn: false,
    };
  }

  const { data: mfaReady } = await supabase.rpc("has_mfa_level2");

  return {
    configured: true,
    signedIn: true,
    email: user.email ?? undefined,
    mfaLevel: mfaReady ? "aal2" : "aal1",
    userId: user.id,
  };
}
