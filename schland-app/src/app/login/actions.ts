"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { hasSupabasePublicEnv, hasSupabaseServerEnv } from "@/lib/env";
import {
  createSupabaseServerClient,
  getSupabaseAdminClient,
} from "@/lib/supabase/server";

export async function signInAction(formData: FormData) {
  const username = normalizeUsername(String(formData.get("username") ?? ""));
  const password = String(formData.get("password") ?? "");
  const nextPath = sanitizeNextPath(String(formData.get("next") ?? "/"));

  if (!hasSupabasePublicEnv()) {
    redirect(
      `/login?error=${encodeURIComponent("Supabase ist noch nicht verbunden.")}`,
    );
  }

  if (!hasSupabaseServerEnv()) {
    redirect(
      `/login?error=${encodeURIComponent("Login per Benutzername ist serverseitig noch nicht verbunden.")}&next=${encodeURIComponent(nextPath)}`,
    );
  }

  if (!username || !password) {
    redirect(
      `/login?error=${encodeURIComponent("Benutzername und Passwort sind erforderlich.")}&next=${encodeURIComponent(nextPath)}`,
    );
  }

  const admin = getSupabaseAdminClient();
  const { data: profile, error: profileError } = await admin
    .from("profiles")
    .select("email,status")
    .eq("username", username)
    .maybeSingle();

  if (
    profileError ||
    !profile?.email ||
    String(profile.status ?? "active") !== "active"
  ) {
    redirect(
      `/login?error=${encodeURIComponent("Benutzername oder Passwort ist falsch.")}&next=${encodeURIComponent(nextPath)}`,
    );
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.signInWithPassword({
    email: String(profile.email),
    password,
  });

  if (error) {
    redirect(
      `/login?error=${encodeURIComponent("Benutzername oder Passwort ist falsch.")}&next=${encodeURIComponent(nextPath)}`,
    );
  }

  redirect(nextPath);
}

export async function signUpAction(formData: FormData) {
  const username = normalizeUsername(String(formData.get("username") ?? ""));
  const displayName = String(formData.get("displayName") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const nextPath = sanitizeNextPath(String(formData.get("next") ?? "/"));

  if (!hasSupabasePublicEnv()) {
    redirect(
      `/register?error=${encodeURIComponent("Supabase ist noch nicht verbunden.")}`,
    );
  }

  if (!username || !email || !password) {
    redirect(
      `/register?error=${encodeURIComponent("Benutzername, E-Mail und Passwort sind erforderlich.")}&next=${encodeURIComponent(nextPath)}`,
    );
  }

  if (!isValidUsername(username)) {
    redirect(
      `/register?error=${encodeURIComponent("Der Benutzername braucht 3-32 Zeichen: Buchstaben, Zahlen, Punkt, Minus oder Unterstrich.")}&next=${encodeURIComponent(nextPath)}`,
    );
  }

  if (password.length < 8) {
    redirect(
      `/register?error=${encodeURIComponent("Das Passwort braucht mindestens 8 Zeichen.")}&next=${encodeURIComponent(nextPath)}`,
    );
  }

  const supabase = await createSupabaseServerClient();
  const callbackUrl = new URL("/auth/callback", await getRequestOrigin());
  callbackUrl.searchParams.set("next", nextPath);

  const { error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      emailRedirectTo: callbackUrl.toString(),
      data: {
        display_name: displayName || username,
        username,
      },
    },
  });

  if (error) {
    redirect(
      `/register?error=${encodeURIComponent(getSignUpErrorMessage(error.message))}&next=${encodeURIComponent(nextPath)}`,
    );
  }

  redirect(
    `/login?message=${encodeURIComponent("Account angelegt. Falls Supabase eine Bestaetigung verlangt, bitte die Mail bestaetigen und dann anmelden.")}&next=${encodeURIComponent(nextPath)}`,
  );
}

export async function sendPasswordResetAction(formData: FormData) {
  const email = String(formData.get("email") ?? "").trim();

  if (!hasSupabasePublicEnv()) {
    redirect(
      `/forgot-password?error=${encodeURIComponent("Supabase ist noch nicht verbunden.")}`,
    );
  }

  if (!email) {
    redirect(
      `/forgot-password?error=${encodeURIComponent("Bitte gib die E-Mail-Adresse des Accounts ein.")}`,
    );
  }

  const supabase = await createSupabaseServerClient();
  const callbackUrl = new URL("/auth/callback", await getRequestOrigin());
  callbackUrl.searchParams.set("next", "/update-password");

  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: callbackUrl.toString(),
  });

  if (error) {
    redirect(
      `/forgot-password?error=${encodeURIComponent("Reset-Mail konnte nicht gesendet werden.")}`,
    );
  }

  redirect(
    `/login?message=${encodeURIComponent("Wenn die E-Mail zu einem Account gehoert, wurde ein Reset-Link gesendet.")}`,
  );
}

export async function updatePasswordAction(formData: FormData) {
  const password = String(formData.get("password") ?? "");
  const passwordConfirm = String(formData.get("passwordConfirm") ?? "");

  if (!hasSupabasePublicEnv()) {
    redirect(
      `/update-password?error=${encodeURIComponent("Supabase ist noch nicht verbunden.")}`,
    );
  }

  if (password.length < 8) {
    redirect(
      `/update-password?error=${encodeURIComponent("Das Passwort braucht mindestens 8 Zeichen.")}`,
    );
  }

  if (password !== passwordConfirm) {
    redirect(
      `/update-password?error=${encodeURIComponent("Die Passwoerter stimmen nicht ueberein.")}`,
    );
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.updateUser({ password });

  if (error) {
    redirect(
      `/update-password?error=${encodeURIComponent("Passwort konnte nicht geaendert werden. Oeffne den Reset-Link erneut.")}`,
    );
  }

  await supabase.auth.signOut();

  redirect(
    `/login?message=${encodeURIComponent("Passwort geaendert. Du kannst dich jetzt mit Benutzername und neuem Passwort anmelden.")}`,
  );
}

function sanitizeNextPath(value: string) {
  if (!value.startsWith("/") || value.startsWith("//")) {
    return "/";
  }

  return value;
}

function normalizeUsername(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_.-]+/g, "_")
    .replace(/^[_\.-]+|[_\.-]+$/g, "")
    .slice(0, 32);
}

function isValidUsername(value: string) {
  return /^[a-z0-9_.-]{3,32}$/.test(value);
}

function getSignUpErrorMessage(message: string) {
  const normalized = message.toLowerCase();

  if (normalized.includes("duplicate") || normalized.includes("unique")) {
    return "Benutzername oder E-Mail ist bereits vergeben.";
  }

  return "Registrierung fehlgeschlagen.";
}

async function getRequestOrigin() {
  const headerList = await headers();
  const origin = headerList.get("origin");

  if (origin) {
    return origin;
  }

  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) {
    return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`;
  }

  return "https://schland.vercel.app";
}
