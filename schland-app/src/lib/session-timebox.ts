import type { NextResponse } from "next/server";

export const SESSION_TIMEBOX_SECONDS = 45 * 60;
export const SESSION_STARTED_COOKIE = "schland_session_started_at";

export function createSessionStartedValue(now = new Date()) {
  return String(Math.floor(now.getTime() / 1000));
}

export function getSessionCookieOptions() {
  return {
    httpOnly: true,
    maxAge: SESSION_TIMEBOX_SECONDS,
    path: "/",
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
  };
}

export function isSessionTimeboxExpired(
  startedAtValue: string | undefined,
  now = new Date(),
) {
  return getSessionRemainingSeconds(startedAtValue, now) <= 0;
}

export function getSessionRemainingSeconds(
  startedAtValue: string | undefined,
  now = new Date(),
) {
  const startedAtSeconds = Number(startedAtValue);

  if (!Number.isFinite(startedAtSeconds) || startedAtSeconds <= 0) {
    return 0;
  }

  const ageSeconds = Math.floor(now.getTime() / 1000) - startedAtSeconds;

  return Math.max(SESSION_TIMEBOX_SECONDS - ageSeconds, 0);
}

export function getSessionExpiresAt(
  startedAtValue: string | undefined,
) {
  const startedAtSeconds = Number(startedAtValue);

  if (!Number.isFinite(startedAtSeconds) || startedAtSeconds <= 0) {
    return null;
  }

  return new Date((startedAtSeconds + SESSION_TIMEBOX_SECONDS) * 1000)
    .toISOString();
}

export function clearSessionCookies(
  response: NextResponse,
  cookieNames: string[],
) {
  for (const name of cookieNames) {
    if (name === SESSION_STARTED_COOKIE || isSupabaseAuthCookie(name)) {
      response.cookies.set(name, "", {
        maxAge: 0,
        path: "/",
      });
    }
  }
}

function isSupabaseAuthCookie(name: string) {
  return (
    (name.startsWith("sb-") && name.includes("auth-token")) ||
    name === "schland_lockdown_access"
  );
}
