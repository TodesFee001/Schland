import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

import { getSupabasePublishableKey, hasSupabasePublicEnv } from "@/lib/env";
import { LOCKDOWN_ACCESS_COOKIE } from "@/lib/lockdown";
import {
  clearSessionCookies,
  isSessionTimeboxExpired,
  SESSION_STARTED_COOKIE,
} from "@/lib/session-timebox";

const PUBLIC_PATHS = [
  "/login",
  "/register",
  "/forgot-password",
  "/update-password",
  "/auth/callback",
  "/api/health",
  "/api/cron",
  "/api/discord-bot",
];

export async function proxy(request: NextRequest) {
  if (!hasSupabasePublicEnv()) {
    return NextResponse.next();
  }

  let response = NextResponse.next({
    request,
  });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    getSupabasePublishableKey()!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => {
            request.cookies.set(name, value);
          });
          response = NextResponse.next({
            request,
          });
          cookiesToSet.forEach(({ name, value, options }) => {
            response.cookies.set(name, value, options);
          });
        },
      },
    },
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const isPublicPath = PUBLIC_PATHS.some((path) =>
    request.nextUrl.pathname.startsWith(path),
  );

  if (
    user &&
    isSessionTimeboxExpired(
      request.cookies.get(SESSION_STARTED_COOKIE)?.value,
    )
  ) {
    await supabase.auth.signOut();

    if (isPublicPath) {
      clearSessionCookies(
        response,
        request.cookies.getAll().map((cookie) => cookie.name),
      );
      return response;
    }

    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = "/login";
    loginUrl.searchParams.set(
      "message",
      "Sitzung abgelaufen. Bitte neu anmelden und 2FA erneut bestaetigen.",
    );
    loginUrl.searchParams.set(
      "next",
      `${request.nextUrl.pathname}${request.nextUrl.search}`,
    );

    const redirectResponse = NextResponse.redirect(loginUrl);

    clearSessionCookies(
      redirectResponse,
      request.cookies.getAll().map((cookie) => cookie.name),
    );

    return redirectResponse;
  }

  if (user && !isPublicPath) {
    const { data: lockdownRows } = await supabase.rpc("get_lockdown_status");
    const lockdownActive =
      Array.isArray(lockdownRows) &&
      lockdownRows.some(
        (row) =>
          typeof row === "object" &&
          row !== null &&
          "active" in row &&
          row.active === true,
      );

    if (lockdownActive) {
      const lockdownToken =
        request.cookies.get(LOCKDOWN_ACCESS_COOKIE)?.value ?? "";
      const { data: lockdownSessionValid } = await supabase.rpc(
        "is_lockdown_session_valid",
        {
          p_token: lockdownToken,
        },
      );

      if (lockdownSessionValid !== true) {
        await supabase.auth.signOut();

        const loginUrl = request.nextUrl.clone();
        loginUrl.pathname = "/login";
        loginUrl.searchParams.set(
          "message",
          "Lockdown aktiv. Anmeldung nur mit Notfallschluessel.",
        );
        loginUrl.searchParams.set(
          "next",
          `${request.nextUrl.pathname}${request.nextUrl.search}`,
        );

        const redirectResponse = NextResponse.redirect(loginUrl);
        clearSessionCookies(
          redirectResponse,
          request.cookies.getAll().map((cookie) => cookie.name),
        );

        return redirectResponse;
      }
    }
  }

  if (!user && !isPublicPath) {
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = "/login";
    loginUrl.searchParams.set("next", request.nextUrl.pathname);
    return NextResponse.redirect(loginUrl);
  }

  if (
    user &&
    ["/login", "/register", "/forgot-password"].includes(
      request.nextUrl.pathname,
    )
  ) {
    const appUrl = request.nextUrl.clone();
    appUrl.pathname = "/";
    appUrl.search = "";
    return NextResponse.redirect(appUrl);
  }

  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
