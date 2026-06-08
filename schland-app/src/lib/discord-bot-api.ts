import { timingSafeEqual } from "node:crypto";

import { NextResponse } from "next/server";

import { hasSupabaseServerEnv } from "@/lib/env";

const BOT_TOKEN_HEADER = "x-schland-bot-token";

export function getDiscordBotAuthError(request: Request) {
  const expectedToken = process.env.DISCORD_BOT_SYNC_TOKEN?.trim();

  if (!expectedToken) {
    return NextResponse.json(
      { error: "discord_bot_api_disabled" },
      { status: 503 },
    );
  }

  const providedToken =
    getBearerToken(request.headers.get("authorization")) ??
    request.headers.get(BOT_TOKEN_HEADER)?.trim() ??
    "";

  if (!providedToken || !tokensMatch(providedToken, expectedToken)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  if (!hasSupabaseServerEnv()) {
    return NextResponse.json(
      { error: "supabase_admin_not_configured" },
      { status: 503 },
    );
  }

  return null;
}

export function getCronAuthError(request: Request) {
  const expectedToken = process.env.CRON_SECRET?.trim();

  if (!expectedToken) {
    return NextResponse.json({ error: "cron_disabled" }, { status: 503 });
  }

  const providedToken = getBearerToken(request.headers.get("authorization")) ?? "";

  if (!providedToken || !tokensMatch(providedToken, expectedToken)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  if (!hasSupabaseServerEnv()) {
    return NextResponse.json(
      { error: "supabase_admin_not_configured" },
      { status: 503 },
    );
  }

  return null;
}

export async function readJsonObject(request: Request) {
  try {
    const value = await request.json();

    return isRecord(value) ? value : null;
  } catch {
    return null;
  }
}

export function asRecord(value: unknown): Record<string, unknown> {
  return isRecord(value) ? value : {};
}

export function asText(value: unknown) {
  const text = String(value ?? "").trim();

  return text || null;
}

export function asInteger(value: unknown) {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  const number = Number(value);

  if (!Number.isFinite(number)) {
    return null;
  }

  return Math.trunc(number);
}

export function asIsoDate(value: unknown) {
  const text = asText(value);

  if (!text) {
    return null;
  }

  const date = new Date(text);

  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

export function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value,
  );
}

function getBearerToken(value: string | null) {
  if (!value) {
    return null;
  }

  const [scheme, token] = value.split(" ");

  if (scheme?.toLowerCase() !== "bearer" || !token) {
    return null;
  }

  return token.trim() || null;
}

function tokensMatch(providedToken: string, expectedToken: string) {
  const provided = Buffer.from(providedToken);
  const expected = Buffer.from(expectedToken);

  if (provided.length !== expected.length) {
    return false;
  }

  return timingSafeEqual(provided, expected);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
