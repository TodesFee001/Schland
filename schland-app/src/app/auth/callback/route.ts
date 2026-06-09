import { NextResponse, type NextRequest } from "next/server";

import {
  createSessionStartedValue,
  getSessionCookieOptions,
  SESSION_STARTED_COOKIE,
} from "@/lib/session-timebox";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  const requestUrl = request.nextUrl;
  const code = requestUrl.searchParams.get("code");
  const nextPath = sanitizeNextPath(requestUrl.searchParams.get("next") ?? "/");

  if (code) {
    const supabase = await createSupabaseServerClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);

    if (error) {
      const loginUrl = new URL("/login", request.url);
      loginUrl.searchParams.set("error", "Auth-Link konnte nicht bestaetigt werden.");
      return NextResponse.redirect(loginUrl);
    }
  }

  const response = NextResponse.redirect(new URL(nextPath, request.url));

  response.cookies.set(
    SESSION_STARTED_COOKIE,
    createSessionStartedValue(),
    getSessionCookieOptions(),
  );

  return response;
}

function sanitizeNextPath(value: string) {
  if (!value.startsWith("/") || value.startsWith("//")) {
    return "/";
  }

  return value;
}
