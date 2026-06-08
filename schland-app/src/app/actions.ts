"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { hasSupabasePublicEnv } from "@/lib/env";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function claimFirstAdminAction() {
  if (!hasSupabasePublicEnv()) {
    redirect("/?setup=missing-supabase");
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("claim_first_administrator");

  if (error) {
    redirect(`/?setup=${encodeURIComponent("admin-claim-error")}`);
  }

  revalidatePath("/", "layout");

  if (data) {
    redirect("/security?setup=admin-claimed");
  }

  redirect("/?setup=admin-exists");
}

export async function createMemberAction(formData: FormData) {
  if (!hasSupabasePublicEnv()) {
    redirect("/?section=members&setup=missing-supabase");
  }

  const reason = getFormText(formData, "reason");
  const name = getFormText(formData, "name");
  const age = getOptionalFormNumber(formData, "age");

  if (!name) {
    redirect("/?section=members&setup=member-create-name");
  }

  if (reason.length < 8) {
    redirect("/?section=members&setup=member-create-reason");
  }

  if (age !== null && age < 0) {
    redirect("/?section=members&setup=member-create-age");
  }

  const supabase = await createSupabaseServerClient();
  const { data: assuranceLevel } =
    await supabase.auth.mfa.getAuthenticatorAssuranceLevel();

  if (assuranceLevel?.currentLevel !== "aal2") {
    redirect("/?section=members&setup=member-create-aal2");
  }

  const { error } = await supabase.rpc("create_member_case", {
    p_age: age,
    p_discord_display_name: getFormText(formData, "discordDisplayName") || null,
    p_discord_id: getFormText(formData, "discordId") || null,
    p_discord_username: getFormText(formData, "discordUsername") || null,
    p_ea: getFormText(formData, "ea") || null,
    p_instagram: getFormText(formData, "instagram") || null,
    p_name: name,
    p_notes: getFormText(formData, "notes") || null,
    p_phone: getFormText(formData, "phone") || null,
    p_profession: getFormText(formData, "profession") || null,
    p_reason: reason,
    p_residence: getFormText(formData, "residence") || null,
    p_snapchat: getFormText(formData, "snapchat") || null,
    p_stream: getFormText(formData, "stream") || null,
    p_tiktok: getFormText(formData, "tiktok") || null,
    p_ubisoft: getFormText(formData, "ubisoft") || null,
  });

  if (error) {
    console.error("create_member_case failed", {
      code: error.code,
      details: error.details,
      message: error.message,
    });
    redirect(`/?section=members&setup=${getMemberCreateErrorSetup(error)}`);
  }

  revalidatePath("/", "layout");
  redirect("/?section=members&setup=member-created");
}

function getFormText(formData: FormData, key: string) {
  return String(formData.get(key) ?? "").trim();
}

function getOptionalFormNumber(formData: FormData, key: string) {
  const value = getFormText(formData, key);

  if (!value) {
    return null;
  }

  const parsed = Number(value);

  return Number.isFinite(parsed) ? parsed : null;
}

function getMemberCreateErrorSetup(error: { code?: string; message?: string }) {
  const message = error.message?.toLowerCase() ?? "";

  if (message.includes("reason")) {
    return "member-create-reason";
  }

  if (message.includes("name")) {
    return "member-create-name";
  }

  if (message.includes("age")) {
    return "member-create-age";
  }

  if (message.includes("denied")) {
    return "member-create-permission";
  }

  if (error.code === "23505" || message.includes("duplicate")) {
    return "member-create-duplicate";
  }

  return "member-create-error";
}
