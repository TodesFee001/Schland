"use server";

import { redirect } from "next/navigation";

import { hasSupabasePublicEnv } from "@/lib/env";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function signInAction(formData: FormData) {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const nextPath = sanitizeNextPath(String(formData.get("next") ?? "/"));

  if (!hasSupabasePublicEnv()) {
    redirect(
      `/login?error=${encodeURIComponent("Supabase ist noch nicht verbunden.")}`,
    );
  }

  if (!email || !password) {
    redirect(
      `/login?error=${encodeURIComponent("E-Mail und Passwort sind erforderlich.")}`,
    );
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error) {
    redirect(
      `/login?error=${encodeURIComponent("Login fehlgeschlagen.")}&next=${encodeURIComponent(nextPath)}`,
    );
  }

  redirect(nextPath);
}

export async function signUpAction(formData: FormData) {
  const displayName = String(formData.get("displayName") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const nextPath = sanitizeNextPath(String(formData.get("next") ?? "/"));

  if (!hasSupabasePublicEnv()) {
    redirect(
      `/login?error=${encodeURIComponent("Supabase ist noch nicht verbunden.")}`,
    );
  }

  if (!email || !password) {
    redirect(
      `/login?error=${encodeURIComponent("E-Mail und Passwort sind erforderlich.")}`,
    );
  }

  if (password.length < 8) {
    redirect(
      `/login?error=${encodeURIComponent("Das Passwort braucht mindestens 8 Zeichen.")}&next=${encodeURIComponent(nextPath)}`,
    );
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: {
        display_name: displayName || email.split("@")[0],
      },
    },
  });

  if (error) {
    redirect(
      `/login?error=${encodeURIComponent("Registrierung fehlgeschlagen.")}&next=${encodeURIComponent(nextPath)}`,
    );
  }

  redirect(
    `/login?message=${encodeURIComponent("Account angelegt. Falls Supabase eine Bestätigung verlangt, bitte die Mail bestätigen und dann anmelden.")}&next=${encodeURIComponent(nextPath)}`,
  );
}

function sanitizeNextPath(value: string) {
  if (!value.startsWith("/") || value.startsWith("//")) {
    return "/";
  }

  return value;
}
