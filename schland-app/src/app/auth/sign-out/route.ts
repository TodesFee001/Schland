import { NextResponse } from "next/server";

import { hasSupabasePublicEnv } from "@/lib/env";
import {
  clearSessionCookies,
  SESSION_STARTED_COOKIE,
} from "@/lib/session-timebox";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function POST(request: Request) {
  if (hasSupabasePublicEnv()) {
    const supabase = await createSupabaseServerClient();
    await supabase.auth.signOut();
  }

  const response = NextResponse.redirect(new URL("/login", request.url), 303);
  const cookieHeader = request.headers.get("cookie") ?? "";
  const cookieNames = cookieHeader
    .split(";")
    .map((cookie) => cookie.trim().split("=")[0])
    .filter(Boolean);

  clearSessionCookies(response, [SESSION_STARTED_COOKIE, ...cookieNames]);

  return response;
}
