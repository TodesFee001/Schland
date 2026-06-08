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

  if (!(await hasMfaLevel2(supabase))) {
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

export async function openMemberCaseAction(formData: FormData) {
  if (!hasSupabasePublicEnv()) {
    redirect("/?section=members&setup=missing-supabase");
  }

  const memberId = getFormText(formData, "memberId");
  const reason = getFormText(formData, "reason");

  if (!memberId) {
    redirect("/?section=members&setup=member-open-missing");
  }

  if (reason.length < 8) {
    redirect("/?section=members&setup=member-open-reason");
  }

  const supabase = await createSupabaseServerClient();

  if (!(await hasMfaLevel2(supabase))) {
    redirect("/?section=members&setup=member-open-aal2");
  }

  const { error } = await supabase.rpc("open_member_case", {
    p_member_id: memberId,
    p_reason: reason,
  });

  if (error) {
    console.error("open_member_case failed", {
      code: error.code,
      details: error.details,
      message: error.message,
    });
    redirect(`/?section=members&setup=${getMemberOpenErrorSetup(error)}`);
  }

  revalidatePath("/", "layout");
  redirect(`/?section=members&member=${encodeURIComponent(memberId)}&setup=member-opened`);
}

export async function setUserRoleAction(formData: FormData) {
  if (!hasSupabasePublicEnv()) {
    redirect("/?section=users&setup=missing-supabase");
  }

  const userId = getFormText(formData, "userId");
  const roleId = getFormText(formData, "roleId");
  const intent = getFormText(formData, "intent");

  if (!userId || !roleId || (intent !== "assign" && intent !== "remove")) {
    redirect("/?section=users&setup=role-assignment-missing");
  }

  const supabase = await createSupabaseServerClient();

  if (!(await hasMfaLevel2(supabase))) {
    redirect("/?section=users&setup=role-assignment-aal2");
  }

  const { error } = await supabase.rpc("set_user_role_assignment", {
    p_assign: intent === "assign",
    p_role_id: roleId,
    p_user_id: userId,
  });

  if (error) {
    console.error("set_user_role_assignment failed", {
      code: error.code,
      details: error.details,
      message: error.message,
    });
    redirect(`/?section=users&setup=${getUserRoleErrorSetup(error)}`);
  }

  revalidatePath("/", "layout");
  redirect(
    `/?section=users&setup=${
      intent === "assign" ? "role-assigned" : "role-removed"
    }`,
  );
}

export async function createFolderAction(formData: FormData) {
  if (!hasSupabasePublicEnv()) {
    redirect("/?section=files&setup=missing-supabase");
  }

  const categoryId = getFormText(formData, "categoryId");
  const name = getFormText(formData, "name");
  const parentFolderId = getFormText(formData, "parentFolderId") || null;

  if (!categoryId || name.length < 2) {
    redirect("/?section=files&setup=folder-missing");
  }

  const supabase = await createSupabaseServerClient();

  if (!(await hasMfaLevel2(supabase))) {
    redirect("/?section=files&setup=folder-aal2");
  }

  const { error } = await supabase.rpc("create_folder_record", {
    p_category_id: categoryId,
    p_name: name,
    p_parent_folder_id: parentFolderId,
  });

  if (error) {
    console.error("create_folder_record failed", {
      code: error.code,
      details: error.details,
      message: error.message,
    });
    redirect(`/?section=files&setup=${getFolderErrorSetup(error)}`);
  }

  revalidatePath("/", "layout");
  redirect("/?section=files&setup=folder-created");
}

export async function setFolderPermissionAction(formData: FormData) {
  if (!hasSupabasePublicEnv()) {
    redirect("/?section=files&setup=missing-supabase");
  }

  const folderId = getFormText(formData, "folderId");
  const roleId = getFormText(formData, "roleId");
  const intent = getFormText(formData, "intent");
  const remove = intent === "remove";

  if (!folderId || !roleId) {
    redirect("/?section=files&setup=folder-permission-missing");
  }

  const supabase = await createSupabaseServerClient();

  if (!(await hasMfaLevel2(supabase))) {
    redirect("/?section=files&setup=folder-aal2");
  }

  const { error } = await supabase.rpc("set_folder_permission", {
    p_can_delete: remove ? false : getFormBool(formData, "canDelete"),
    p_can_download: remove ? false : getFormBool(formData, "canDownload"),
    p_can_edit: remove ? false : getFormBool(formData, "canEdit"),
    p_can_manage_permissions: remove
      ? false
      : getFormBool(formData, "canManagePermissions"),
    p_can_open: remove ? false : getFormBool(formData, "canOpen"),
    p_can_upload: remove ? false : getFormBool(formData, "canUpload"),
    p_can_view: remove ? false : getFormBool(formData, "canView"),
    p_folder_id: folderId,
    p_role_id: roleId,
  });

  if (error) {
    console.error("set_folder_permission failed", {
      code: error.code,
      details: error.details,
      message: error.message,
    });
    redirect(`/?section=files&setup=${getFolderErrorSetup(error)}`);
  }

  revalidatePath("/", "layout");
  redirect(
    `/?section=files&setup=${
      remove ? "folder-permission-removed" : "folder-permission-saved"
    }`,
  );
}

export async function deleteFolderAction(formData: FormData) {
  if (!hasSupabasePublicEnv()) {
    redirect("/?section=files&setup=missing-supabase");
  }

  const folderId = getFormText(formData, "folderId");

  if (!folderId) {
    redirect("/?section=files&setup=folder-missing");
  }

  const supabase = await createSupabaseServerClient();

  if (!(await hasMfaLevel2(supabase))) {
    redirect("/?section=files&setup=folder-aal2");
  }

  const { error } = await supabase.rpc("delete_empty_folder", {
    p_folder_id: folderId,
  });

  if (error) {
    console.error("delete_empty_folder failed", {
      code: error.code,
      details: error.details,
      message: error.message,
    });
    redirect(`/?section=files&setup=${getFolderErrorSetup(error)}`);
  }

  revalidatePath("/", "layout");
  redirect("/?section=files&setup=folder-deleted");
}

function getFormText(formData: FormData, key: string) {
  return String(formData.get(key) ?? "").trim();
}

function getFormBool(formData: FormData, key: string) {
  return formData.get(key) === "on";
}

type SupabaseServerClient = Awaited<ReturnType<typeof createSupabaseServerClient>>;

async function hasMfaLevel2(supabase: SupabaseServerClient) {
  const { data } = await supabase.rpc("has_mfa_level2");

  return data === true;
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

function getMemberOpenErrorSetup(error: { message?: string }) {
  const message = error.message?.toLowerCase() ?? "";

  if (message.includes("reason")) {
    return "member-open-reason";
  }

  if (message.includes("not found")) {
    return "member-open-missing";
  }

  if (message.includes("denied")) {
    return "member-open-permission";
  }

  return "member-open-error";
}

function getUserRoleErrorSetup(error: { message?: string }) {
  const message = error.message?.toLowerCase() ?? "";

  if (message.includes("last administrator")) {
    return "role-assignment-last-admin";
  }

  if (message.includes("not found")) {
    return "role-assignment-missing";
  }

  if (message.includes("denied")) {
    return "role-assignment-permission";
  }

  return "role-assignment-error";
}

function getFolderErrorSetup(error: { code?: string; message?: string }) {
  const message = error.message?.toLowerCase() ?? "";

  if (message.includes("not empty")) {
    return "folder-not-empty";
  }

  if (message.includes("not found")) {
    return "folder-missing";
  }

  if (message.includes("required")) {
    return "folder-missing";
  }

  if (message.includes("denied")) {
    return "folder-permission-denied";
  }

  if (message.includes("parent folder")) {
    return "folder-parent";
  }

  if (error.code === "23505" || message.includes("duplicate")) {
    return "folder-duplicate";
  }

  return "folder-error";
}
