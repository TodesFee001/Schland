import { cookies } from "next/headers";

import { hasSupabasePublicEnv } from "@/lib/env";
import {
  getSessionExpiresAt,
  getSessionRemainingSeconds,
  isSessionTimeboxExpired,
  SESSION_STARTED_COOKIE,
} from "@/lib/session-timebox";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type AuthStatus = {
  configured: boolean;
  signedIn: boolean;
  email?: string;
  mfaLevel?: string;
  mfaRequired?: boolean;
  sessionExpiresAt?: string;
  sessionRemainingSeconds?: number;
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

  const cookieStore = await cookies();
  const sessionStartedAt = cookieStore.get(SESSION_STARTED_COOKIE)?.value;

  if (isSessionTimeboxExpired(sessionStartedAt)) {
    return {
      configured: true,
      signedIn: false,
    };
  }

  const [{ data: mfaReady }, { data: profile }] = await Promise.all([
    supabase.rpc("has_mfa_level2"),
    supabase
      .from("profiles")
      .select("two_factor_required")
      .eq("id", user.id)
      .maybeSingle(),
  ]);

  return {
    configured: true,
    signedIn: true,
    email: user.email ?? undefined,
    mfaLevel: mfaReady ? "aal2" : "aal1",
    mfaRequired: profile?.two_factor_required !== false,
    sessionExpiresAt: getSessionExpiresAt(sessionStartedAt) ?? undefined,
    sessionRemainingSeconds: getSessionRemainingSeconds(sessionStartedAt),
    userId: user.id,
  };
}
