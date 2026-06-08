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

  const { data: assuranceLevel } =
    await supabase.auth.mfa.getAuthenticatorAssuranceLevel();

  return {
    configured: true,
    signedIn: true,
    email: user.email ?? undefined,
    mfaLevel: assuranceLevel?.currentLevel ?? "aal1",
    userId: user.id,
  };
}
