"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import {
  deleteDiscordInviteRequest,
  executeDiscordModerationAction,
} from "@/lib/discord-sync";
import { hasSupabasePublicEnv, hasSupabaseServerEnv } from "@/lib/env";
import {
  createGoogleDocFromTemplate,
  ensureFolderRecordOnDrive,
  moveDriveFileForRecord,
  runDriveSync,
  uploadFileRecordToDrive,
} from "@/lib/google-drive-sync";
import {
  analyzeModerationAdviceCase,
  queueModerationAdviceExecution,
  writeModerationAdviceLog,
} from "@/lib/moderation-advice";
import {
  createOfficialModerationAdviceDocument,
  type OfficialAdviceDocumentType,
} from "@/lib/moderation-advice-documents";
import {
  createSupabaseServerClient,
  getSupabaseAdminClient,
} from "@/lib/supabase/server";

const FILE_BUCKET = "schland-files";
const MAX_UPLOAD_BYTES = 50 * 1024 * 1024;
const MAX_ADVICE_UPLOAD_BYTES = 20 * 1024 * 1024;
const MAX_ADVICE_TOTAL_UPLOAD_BYTES = 45 * 1024 * 1024;
const MAX_ADVICE_UPLOADS = 20;
const ADVICE_STAGING_PREFIX = "moderation-advice-staging";
const MAX_PROFILE_IMAGE_BYTES = 8 * 1024 * 1024;
const PROFILE_IMAGE_CATEGORY_NAME = "Profilbilder";
const PROFILE_IMAGE_CONTENT_TYPES = new Set([
  "image/avif",
  "image/gif",
  "image/jpeg",
  "image/png",
  "image/webp",
]);
const ADVICE_FILE_CONTENT_TYPES = new Set([
  "application/csv",
  "application/msword",
  "application/json",
  "application/markdown",
  "application/rtf",
  "application/pdf",
  "application/vnd.ms-excel",
  "application/vnd.ms-powerpoint",
  "application/vnd.oasis.opendocument.presentation",
  "application/vnd.oasis.opendocument.spreadsheet",
  "application/vnd.oasis.opendocument.text",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/x-rtf",
  "application/xml",
  "image/avif",
  "image/gif",
  "image/jpeg",
  "image/png",
  "image/svg+xml",
  "image/webp",
  "text/csv",
  "text/html",
  "text/markdown",
  "text/plain",
  "text/rtf",
  "text/tab-separated-values",
  "text/xml",
  "text/yaml",
]);
const ADVICE_TEXT_CONTENT_TYPES = new Set([
  "application/csv",
  "application/json",
  "application/markdown",
  "application/xml",
  "text/csv",
  "text/html",
  "text/markdown",
  "text/plain",
  "text/tab-separated-values",
  "text/xml",
  "text/yaml",
]);
const ADVICE_FILE_EXTENSIONS = new Set([
  ".avif",
  ".bmp",
  ".csv",
  ".doc",
  ".docx",
  ".gif",
  ".heic",
  ".htm",
  ".html",
  ".jpeg",
  ".jpg",
  ".json",
  ".md",
  ".odt",
  ".pdf",
  ".png",
  ".ppt",
  ".pptx",
  ".rtf",
  ".svg",
  ".tif",
  ".tiff",
  ".tsv",
  ".txt",
  ".webp",
  ".xls",
  ".xlsx",
  ".xml",
  ".yaml",
  ".yml",
]);

type UploadedAdviceEvidence = {
  contentType: string;
  evidenceType: "file" | "screenshot";
  extractedText: string;
  originalName: string;
  size: number;
  storagePath: string;
};

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

export async function linkMemberFileAction(formData: FormData) {
  if (!hasSupabasePublicEnv() || !hasSupabaseServerEnv()) {
    redirect("/?section=members&setup=missing-supabase");
  }

  const memberId = getFormText(formData, "memberId");
  const fileId = getFormText(formData, "fileId");
  const reason = getFormText(formData, "reason");
  const relationType = getMemberFileRelationType(formData);

  if (!isUuidText(memberId) || !isUuidText(fileId)) {
    redirect("/?section=members&setup=member-file-missing");
  }

  if (reason.length < 8) {
    redirect(
      `/?section=members&member=${encodeURIComponent(
        memberId,
      )}&setup=member-file-reason`,
    );
  }

  const supabase = await createSupabaseServerClient();

  if (!(await hasMfaLevel2(supabase))) {
    redirect(
      `/?section=members&member=${encodeURIComponent(
        memberId,
      )}&setup=member-file-aal2`,
    );
  }

  const { data: canEdit } = await supabase.rpc("has_permission", {
    required_key: "members.edit",
  });
  const { data: canViewFiles } = await supabase.rpc("has_permission", {
    required_key: "files.view",
  });
  const { data: canOpenFiles } = await supabase.rpc("has_permission", {
    required_key: "files.open",
  });

  if (canEdit !== true || canViewFiles !== true || canOpenFiles !== true) {
    redirect(
      `/?section=members&member=${encodeURIComponent(
        memberId,
      )}&setup=member-file-permission`,
    );
  }

  try {
    await setMemberFileLinkWithAudit({
      fileId,
      link: true,
      memberId,
      reason,
      relationType,
      supabase,
    });
  } catch (error) {
    console.error("member file link failed", {
      message: error instanceof Error ? error.message : String(error),
    });
    redirect(
      `/?section=members&member=${encodeURIComponent(
        memberId,
      )}&setup=${getMemberFileLinkErrorSetup(error)}`,
    );
  }

  revalidatePath("/", "layout");
  redirect(
    `/?section=members&member=${encodeURIComponent(
      memberId,
    )}&setup=member-file-linked`,
  );
}

export async function unlinkMemberFileAction(formData: FormData) {
  if (!hasSupabasePublicEnv() || !hasSupabaseServerEnv()) {
    redirect("/?section=members&setup=missing-supabase");
  }

  const memberId = getFormText(formData, "memberId");
  const fileId = getFormText(formData, "fileId");
  const reason = getFormText(formData, "reason");

  if (!isUuidText(memberId) || !isUuidText(fileId)) {
    redirect("/?section=members&setup=member-file-missing");
  }

  if (reason.length < 8) {
    redirect(
      `/?section=members&member=${encodeURIComponent(
        memberId,
      )}&setup=member-file-reason`,
    );
  }

  const supabase = await createSupabaseServerClient();

  if (!(await hasMfaLevel2(supabase))) {
    redirect(
      `/?section=members&member=${encodeURIComponent(
        memberId,
      )}&setup=member-file-aal2`,
    );
  }

  const { data: canEdit } = await supabase.rpc("has_permission", {
    required_key: "members.edit",
  });
  const { data: canViewFiles } = await supabase.rpc("has_permission", {
    required_key: "files.view",
  });
  const { data: canOpenFiles } = await supabase.rpc("has_permission", {
    required_key: "files.open",
  });

  if (canEdit !== true || canViewFiles !== true || canOpenFiles !== true) {
    redirect(
      `/?section=members&member=${encodeURIComponent(
        memberId,
      )}&setup=member-file-permission`,
    );
  }

  try {
    await setMemberFileLinkWithAudit({
      fileId,
      link: false,
      memberId,
      reason,
      relationType: "linked",
      supabase,
    });
  } catch (error) {
    console.error("member file unlink failed", {
      message: error instanceof Error ? error.message : String(error),
    });
    redirect(
      `/?section=members&member=${encodeURIComponent(
        memberId,
      )}&setup=${getMemberFileLinkErrorSetup(error)}`,
    );
  }

  revalidatePath("/", "layout");
  redirect(
    `/?section=members&member=${encodeURIComponent(
      memberId,
    )}&setup=member-file-unlinked`,
  );
}

export async function uploadMemberProfileImageAction(formData: FormData) {
  if (!hasSupabasePublicEnv() || !hasSupabaseServerEnv()) {
    redirect("/?section=members&setup=missing-supabase");
  }

  const memberId = getFormText(formData, "memberId");
  const reason = getFormText(formData, "reason");
  const file = formData.get("profileImage");

  if (!isUuidText(memberId) || !(file instanceof File)) {
    redirect("/?section=members&setup=member-avatar-missing");
  }

  if (reason.length < 8) {
    redirect(
      `/?section=members&member=${encodeURIComponent(
        memberId,
      )}&setup=member-avatar-reason`,
    );
  }

  if (file.size <= 0 || file.size > MAX_PROFILE_IMAGE_BYTES) {
    redirect(
      `/?section=members&member=${encodeURIComponent(
        memberId,
      )}&setup=member-avatar-size`,
    );
  }

  const fileType = (file.type || "application/octet-stream").toLowerCase();

  if (!PROFILE_IMAGE_CONTENT_TYPES.has(fileType)) {
    redirect(
      `/?section=members&member=${encodeURIComponent(
        memberId,
      )}&setup=member-avatar-type`,
    );
  }

  const supabase = await createSupabaseServerClient();

  if (!(await hasMfaLevel2(supabase))) {
    redirect(
      `/?section=members&member=${encodeURIComponent(
        memberId,
      )}&setup=member-file-aal2`,
    );
  }

  const { data: canEdit } = await supabase.rpc("has_permission", {
    required_key: "members.edit",
  });
  const { data: canUploadFiles } = await supabase.rpc("has_permission", {
    required_key: "files.upload",
  });
  const { data: canOpenFiles } = await supabase.rpc("has_permission", {
    required_key: "files.open",
  });
  const { data: canViewFiles } = await supabase.rpc("has_permission", {
    required_key: "files.view",
  });

  if (
    canEdit !== true ||
    canUploadFiles !== true ||
    canOpenFiles !== true ||
    canViewFiles !== true
  ) {
    redirect(
      `/?section=members&member=${encodeURIComponent(
        memberId,
      )}&setup=member-file-permission`,
    );
  }

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    redirect(
      `/?section=members&member=${encodeURIComponent(
        memberId,
      )}&setup=member-file-permission`,
    );
  }

  const originalName = file.name || "profilbild";
  const storagePath = buildStoragePath(user.id, `profile-${originalName}`);
  const fileBody = new Uint8Array(await file.arrayBuffer());

  const { error: uploadError } = await supabase.storage
    .from(FILE_BUCKET)
    .upload(storagePath, fileBody, {
      contentType: fileType,
      upsert: false,
    });

  if (uploadError) {
    console.error("profile image storage upload failed", {
      message: uploadError.message,
    });
    redirect(
      `/?section=members&member=${encodeURIComponent(
        memberId,
      )}&setup=member-avatar-storage`,
    );
  }

  try {
    const categoryId = await ensureProfileImageCategory();
    const { data: fileId, error } = await supabase.rpc("register_uploaded_file", {
      p_category_id: categoryId,
      p_description: `Profilbild fuer Mitgliederakte ${memberId}`,
      p_file_size: file.size,
      p_file_type: fileType,
      p_folder_id: null,
      p_original_filename: originalName,
      p_storage_path: storagePath,
      p_tags: ["profilbild", "mitgliederakte"],
    });

    if (error || !isUuidText(String(fileId ?? ""))) {
      throw new Error(error?.message ?? "profile image file registration failed");
    }

    await setMemberFileLinkWithAudit({
      fileId: String(fileId),
      link: true,
      memberId,
      reason,
      relationType: "avatar",
      supabase,
    });
  } catch (error) {
    await supabase.storage.from(FILE_BUCKET).remove([storagePath]);
    console.error("profile image upload failed", {
      message: error instanceof Error ? error.message : String(error),
    });
    redirect(
      `/?section=members&member=${encodeURIComponent(
        memberId,
      )}&setup=${getMemberProfileImageErrorSetup(error)}`,
    );
  }

  revalidatePath("/", "layout");
  redirect(
    `/?section=members&member=${encodeURIComponent(
      memberId,
    )}&setup=member-avatar-uploaded`,
  );
}

export async function setMemberDiscordAnalyticsAction(formData: FormData) {
  if (!hasSupabasePublicEnv()) {
    redirect("/?section=members&setup=missing-supabase");
  }

  const memberId = getFormText(formData, "memberId");
  const enabledValue = getFormText(formData, "enabled");
  const reason = getFormText(formData, "reason");
  const enabled =
    enabledValue === "true" ? true : enabledValue === "false" ? false : null;

  if (!memberId || enabled === null) {
    redirect("/?section=members&setup=member-analytics-missing");
  }

  if (reason.length < 8) {
    redirect(
      `/?section=members&member=${encodeURIComponent(
        memberId,
      )}&setup=member-analytics-reason`,
    );
  }

  const supabase = await createSupabaseServerClient();

  if (!(await hasMfaLevel2(supabase))) {
    redirect(
      `/?section=members&member=${encodeURIComponent(
        memberId,
      )}&setup=member-analytics-aal2`,
    );
  }

  const { error } = await supabase.rpc("set_member_discord_analytics", {
    p_enabled: enabled,
    p_member_id: memberId,
    p_reason: reason,
  });

  if (error) {
    console.error("set_member_discord_analytics failed", {
      code: error.code,
      details: error.details,
      message: error.message,
    });
    redirect(
      `/?section=members&member=${encodeURIComponent(
        memberId,
      )}&setup=${getMemberDiscordAnalyticsErrorSetup(error)}`,
    );
  }

  revalidatePath("/", "layout");
  redirect(
    `/?section=members&member=${encodeURIComponent(memberId)}&setup=${
      enabled ? "member-analytics-enabled" : "member-analytics-disabled"
    }`,
  );
}

export async function updateMemberCaseAction(formData: FormData) {
  if (!hasSupabasePublicEnv()) {
    redirect("/?section=members&setup=missing-supabase");
  }

  const memberId = getFormText(formData, "memberId");
  const reason = getFormText(formData, "reason");
  const name = getFormText(formData, "name");
  const status = getFormText(formData, "status") || "active";

  if (!memberId) {
    redirect("/?section=members&setup=member-update-missing");
  }

  if (!name) {
    redirect(
      `/?section=members&member=${encodeURIComponent(memberId)}&setup=member-update-name`,
    );
  }

  if (reason.length < 8) {
    redirect(
      `/?section=members&member=${encodeURIComponent(memberId)}&setup=member-update-reason`,
    );
  }

  const age = getOptionalFormNumber(formData, "age");

  if (age !== null && age < 0) {
    redirect(
      `/?section=members&member=${encodeURIComponent(memberId)}&setup=member-update-age`,
    );
  }

  const supabase = await createSupabaseServerClient();

  if (!(await hasMfaLevel2(supabase))) {
    redirect(
      `/?section=members&member=${encodeURIComponent(memberId)}&setup=member-update-aal2`,
    );
  }

  const { error } = await supabase.rpc("update_member_case", {
    p_age: age,
    p_discord_display_name: getFormText(formData, "discordDisplayName") || null,
    p_discord_id: getFormText(formData, "discordId") || null,
    p_discord_username: getFormText(formData, "discordUsername") || null,
    p_ea: getFormText(formData, "ea") || null,
    p_instagram: getFormText(formData, "instagram") || null,
    p_member_id: memberId,
    p_name: name,
    p_notes: getFormText(formData, "notes") || null,
    p_phone: getFormText(formData, "phone") || null,
    p_profession: getFormText(formData, "profession") || null,
    p_reason: reason,
    p_residence: getFormText(formData, "residence") || null,
    p_snapchat: getFormText(formData, "snapchat") || null,
    p_status: isMemberStatus(status) ? status : "active",
    p_stream: getFormText(formData, "stream") || null,
    p_tiktok: getFormText(formData, "tiktok") || null,
    p_ubisoft: getFormText(formData, "ubisoft") || null,
  });

  if (error) {
    console.error("update_member_case failed", {
      code: error.code,
      details: error.details,
      message: error.message,
    });
    redirect(
      `/?section=members&member=${encodeURIComponent(memberId)}&setup=${getMemberUpdateErrorSetup(error)}`,
    );
  }

  revalidatePath("/", "layout");
  redirect(
    `/?section=members&member=${encodeURIComponent(memberId)}&setup=member-updated`,
  );
}

export async function deleteMemberCaseAction(formData: FormData) {
  if (!hasSupabasePublicEnv()) {
    redirect("/?section=members&setup=missing-supabase");
  }

  const memberId = getFormText(formData, "memberId");
  const reason = getFormText(formData, "reason");

  if (!memberId) {
    redirect("/?section=members&setup=member-delete-missing");
  }

  if (reason.length < 8) {
    redirect(
      `/?section=members&member=${encodeURIComponent(memberId)}&setup=member-delete-reason`,
    );
  }

  const supabase = await createSupabaseServerClient();

  if (!(await hasMfaLevel2(supabase))) {
    redirect(
      `/?section=members&member=${encodeURIComponent(memberId)}&setup=member-delete-aal2`,
    );
  }

  const { error } = await supabase.rpc("delete_member_case", {
    p_member_id: memberId,
    p_reason: reason,
  });

  if (error) {
    console.error("delete_member_case failed", {
      code: error.code,
      details: error.details,
      message: error.message,
    });
    redirect(
      `/?section=members&member=${encodeURIComponent(memberId)}&setup=${getMemberDeleteErrorSetup(error)}`,
    );
  }

  revalidatePath("/", "layout");
  redirect("/?section=members&setup=member-deleted");
}

export async function createDiscordInviteRequestAction(formData: FormData) {
  if (!hasSupabasePublicEnv()) {
    redirect("/?section=sync&setup=missing-supabase");
  }

  const inviteeDiscordId = getFormText(formData, "inviteeDiscordId");
  const inviteeName = getFormText(formData, "inviteeName");
  const reason = getFormText(formData, "reason");

  if (!/^[0-9]{15,25}$/.test(inviteeDiscordId)) {
    redirect("/?section=sync&setup=discord-invite-name");
  }

  if (reason.length < 8) {
    redirect("/?section=sync&setup=discord-invite-reason");
  }

  const supabase = await createSupabaseServerClient();

  if (!(await hasMfaLevel2(supabase))) {
    redirect("/?section=sync&setup=discord-invite-aal2");
  }

  const { error } = await supabase.rpc("create_discord_invite_request", {
    p_invitee_discord_id: inviteeDiscordId,
    p_invitee_name: inviteeName,
    p_reason: reason,
  });

  if (error) {
    console.error("create_discord_invite_request failed", {
      code: error.code,
      details: error.details,
      message: error.message,
    });
    redirect(`/?section=sync&setup=${getDiscordInviteErrorSetup(error)}`);
  }

  revalidatePath("/", "layout");
  redirect("/?section=sync&setup=discord-invite-created");
}

export async function runDiscordManualSyncAction() {
  if (!hasSupabasePublicEnv()) {
    redirect("/?section=sync&setup=discord-sync-failed");
  }

  const supabase = await createSupabaseServerClient();
  const { data: canSync } = await supabase.rpc("has_permission", {
    required_key: "sync.manage",
  });
  const { data: canInvite } = await supabase.rpc("has_permission", {
    required_key: "discord.invites.create",
  });

  if (canSync !== true && canInvite !== true) {
    redirect("/?section=sync&setup=discord-sync-denied");
  }

  revalidatePath("/", "layout");
  redirect("/?section=sync&setup=discord-live-refresh");
}

export async function deleteDiscordInviteRequestAction(formData: FormData) {
  if (!hasSupabasePublicEnv() || !hasSupabaseServerEnv()) {
    redirect("/?section=sync&setup=discord-invite-delete-failed");
  }

  const inviteId = getFormText(formData, "inviteId");

  if (!inviteId) {
    redirect("/?section=sync&setup=discord-invite-delete-missing");
  }

  const supabase = await createSupabaseServerClient();

  if (!(await hasMfaLevel2(supabase))) {
    redirect("/?section=sync&setup=discord-invite-delete-aal2");
  }

  const { data: canInvite } = await supabase.rpc("has_permission", {
    required_key: "discord.invites.create",
  });
  const { data: canSync } = await supabase.rpc("has_permission", {
    required_key: "sync.manage",
  });

  if (canInvite !== true && canSync !== true) {
    redirect("/?section=sync&setup=discord-invite-delete-denied");
  }

  try {
    await deleteDiscordInviteRequest(inviteId);
  } catch (error) {
    console.error("discord invite delete failed", {
      message: error instanceof Error ? error.message : String(error),
    });
    redirect("/?section=sync&setup=discord-invite-delete-failed");
  }

  revalidatePath("/", "layout");
  redirect("/?section=sync&setup=discord-invite-deleted");
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

export async function setUserTwoFactorRequirementAction(formData: FormData) {
  if (!hasSupabasePublicEnv()) {
    redirect("/?section=users&setup=missing-supabase");
  }

  const userId = getFormText(formData, "userId");
  const intent = getFormText(formData, "intent");

  if (!isUuidText(userId) || (intent !== "require" && intent !== "disable")) {
    redirect("/?section=users&setup=two-factor-requirement-missing");
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("set_profile_two_factor_required", {
    p_required: intent === "require",
    p_user_id: userId,
  });

  if (error) {
    console.error("set_profile_two_factor_required failed", {
      code: error.code,
      details: error.details,
      message: error.message,
    });
    redirect(
      `/?section=users&setup=${getTwoFactorRequirementErrorSetup(error)}`,
    );
  }

  revalidatePath("/", "layout");
  redirect(
    `/?section=users&setup=${
      intent === "require"
        ? "two-factor-requirement-enabled"
        : "two-factor-requirement-disabled"
    }`,
  );
}

export async function saveCategoryAction(formData: FormData) {
  if (!hasSupabasePublicEnv()) {
    redirect("/?section=categories&setup=missing-supabase");
  }

  const categoryId = getFormText(formData, "categoryId") || null;
  const name = getFormText(formData, "name");
  const sortOrder = getOptionalFormNumber(formData, "sortOrder");

  if (name.length < 2) {
    redirect("/?section=categories&setup=category-name");
  }

  const supabase = await createSupabaseServerClient();

  if (!(await hasMfaLevel2(supabase))) {
    redirect("/?section=categories&setup=category-aal2");
  }

  const { error } = await supabase.rpc("upsert_file_category", {
    p_active: getFormBool(formData, "active"),
    p_category_id: categoryId,
    p_description: getFormText(formData, "description") || null,
    p_name: name,
    p_sort_order: sortOrder,
  });

  if (error) {
    console.error("upsert_file_category failed", {
      code: error.code,
      details: error.details,
      message: error.message,
    });
    redirect(`/?section=categories&setup=${getCategoryErrorSetup(error)}`);
  }

  revalidatePath("/", "layout");
  redirect(
    `/?section=categories&setup=${categoryId ? "category-saved" : "category-created"}`,
  );
}

export async function saveRoleAction(formData: FormData) {
  if (!hasSupabasePublicEnv()) {
    redirect("/?section=roles&setup=missing-supabase");
  }

  const roleId = getFormText(formData, "roleId") || null;
  const roleKey = getFormText(formData, "roleKey");
  const name = getFormText(formData, "name");

  if (name.length < 2) {
    redirect("/?section=roles&setup=role-name");
  }

  if (!roleId && roleKey.length < 2) {
    redirect("/?section=roles&setup=role-key");
  }

  const supabase = await createSupabaseServerClient();

  if (!(await hasMfaLevel2(supabase))) {
    redirect("/?section=roles&setup=role-aal2");
  }

  const { error } = await supabase.rpc("save_role", {
    p_active: getFormBool(formData, "active"),
    p_description: getFormText(formData, "description") || null,
    p_name: name,
    p_role_id: roleId,
    p_role_key: roleKey || name,
  });

  if (error) {
    console.error("save_role failed", {
      code: error.code,
      details: error.details,
      message: error.message,
    });
    redirect(`/?section=roles&setup=${getRoleErrorSetup(error)}`);
  }

  revalidatePath("/", "layout");
  redirect(`/?section=roles&setup=${roleId ? "role-saved" : "role-created"}`);
}

export async function setRolePermissionAction(formData: FormData) {
  if (!hasSupabasePublicEnv()) {
    redirect("/?section=roles&setup=missing-supabase");
  }

  const roleId = getFormText(formData, "roleId");
  const permissionId = getFormText(formData, "permissionId");
  const intent = getFormText(formData, "intent");

  if (!roleId || !permissionId || (intent !== "assign" && intent !== "remove")) {
    redirect("/?section=roles&setup=role-permission-missing");
  }

  const supabase = await createSupabaseServerClient();

  if (!(await hasMfaLevel2(supabase))) {
    redirect("/?section=roles&setup=role-aal2");
  }

  const { error } = await supabase.rpc("set_role_permission_assignment", {
    p_assign: intent === "assign",
    p_permission_id: permissionId,
    p_role_id: roleId,
  });

  if (error) {
    console.error("set_role_permission_assignment failed", {
      code: error.code,
      details: error.details,
      message: error.message,
    });
    redirect(`/?section=roles&setup=${getRolePermissionErrorSetup(error)}`);
  }

  revalidatePath("/", "layout");
  redirect(
    `/?section=roles&setup=${
      intent === "assign" ? "role-permission-added" : "role-permission-removed"
    }`,
  );
}

export async function startMemberAbsenceAction(formData: FormData) {
  if (!hasSupabasePublicEnv() || !hasSupabaseServerEnv()) {
    redirect("/?section=representation&setup=missing-supabase");
  }

  const memberId = getFormText(formData, "memberId");
  const reason = getFormText(formData, "reason");
  const expectedReturnAt = getOptionalIsoDate(formData, "expectedReturnAt");

  if (!isUuidText(memberId)) {
    redirect("/?section=representation&setup=absence-member");
  }

  if (reason.length < 8) {
    redirect("/?section=representation&setup=absence-reason");
  }

  const supabase = await createSupabaseServerClient();

  if (!(await hasMfaLevel2(supabase))) {
    redirect("/?section=representation&setup=absence-aal2");
  }

  if (!(await hasPermission(supabase, "app.enter"))) {
    redirect("/?section=representation&setup=absence-denied");
  }

  const admin = getSupabaseAdminClient();
  const actor = await getActionActor(supabase);

  try {
    const member = await getAbsenceMember(admin, memberId);

    if (!member?.id) {
      redirect("/?section=representation&setup=absence-member");
    }

    const discordUserId = asActionText(member.discord_id);

    if (!discordUserId || !isDiscordSnowflake(discordUserId)) {
      redirect("/?section=representation&setup=absence-discord");
    }

    if (member.discord_on_server !== true) {
      redirect("/?section=representation&setup=absence-off-server");
    }

    const existingAbsence = await getActiveAbsenceForMember(admin, memberId);

    if (existingAbsence) {
      redirect("/?section=representation&setup=absence-already-active");
    }

    const ministryRoles = await getMemberMinistryRoles(admin, member);
    const { data: absence, error: absenceError } = await admin
      .from("member_absences")
      .insert({
        discord_user_id: discordUserId,
        expected_return_at: expectedReturnAt,
        member_id: memberId,
        reason,
        requested_by: actor.id,
        requested_by_name: actor.name,
        status: "active",
      })
      .select("id")
      .single();

    if (absenceError || !absence?.id) {
      throw new Error(absenceError?.message ?? "absence insert failed");
    }

    const representations = await buildAbsenceRepresentations(admin, {
      absenceId: String(absence.id),
      discordUserId,
      memberId,
      ministryRoles,
    });

    if (representations.length > 0) {
      const { error: representationError } = await admin
        .from("member_absence_representations")
        .insert(representations);

      if (representationError) {
        throw new Error(representationError.message);
      }
    }

    await writeMemberCaseAuditLog({
      fieldName: "absence_started",
      memberId,
      newValue: JSON.stringify({
        absenceId: absence.id,
        ministryRoles: ministryRoles.map((role) => role.name),
        representations: representations.length,
      }),
      reason,
      supabase,
    });

    revalidatePath("/", "layout");
    redirect(
      `/?section=representation&setup=${
        ministryRoles.length > 0 ? "absence-started" : "absence-started-no-roles"
      }`,
    );
  } catch (error) {
    if (isRedirectError(error)) {
      throw error;
    }

    console.error("start member absence failed", {
      message: error instanceof Error ? error.message : String(error),
    });
    redirect("/?section=representation&setup=absence-error");
  }
}

export async function endMemberAbsenceAction(formData: FormData) {
  if (!hasSupabasePublicEnv() || !hasSupabaseServerEnv()) {
    redirect("/?section=representation&setup=missing-supabase");
  }

  const absenceId = getFormText(formData, "absenceId");
  const reason = getFormText(formData, "reason");

  if (!isUuidText(absenceId)) {
    redirect("/?section=representation&setup=absence-end-missing");
  }

  if (reason.length < 8) {
    redirect("/?section=representation&setup=absence-end-reason");
  }

  const supabase = await createSupabaseServerClient();

  if (!(await hasMfaLevel2(supabase))) {
    redirect("/?section=representation&setup=absence-aal2");
  }

  if (!(await hasPermission(supabase, "app.enter"))) {
    redirect("/?section=representation&setup=absence-denied");
  }

  const admin = getSupabaseAdminClient();
  const actor = await getActionActor(supabase);
  const now = new Date().toISOString();

  try {
    const { data: absence, error: absenceError } = await admin
      .from("member_absences")
      .select("id,member_id,status")
      .eq("id", absenceId)
      .maybeSingle();

    if (absenceError || !absence?.id) {
      redirect("/?section=representation&setup=absence-end-missing");
    }

    const status = String(absence.status ?? "");

    if (status !== "active" && status !== "ending") {
      redirect("/?section=representation&setup=absence-end-missing");
    }

    const { data: endingRows, error: repError } = await admin
      .from("member_absence_representations")
      .update({
        bot_error: null,
        status: "ending",
      })
      .eq("absence_id", absenceId)
      .in("status", ["pending", "assigning", "active"])
      .select("id");

    if (repError) {
      throw new Error(repError.message);
    }

    const nextStatus = (endingRows ?? []).length > 0 ? "ending" : "ended";
    const { error: updateError } = await admin
      .from("member_absences")
      .update({
        ended_at: nextStatus === "ended" ? now : null,
        ended_by: actor.id,
        ended_by_name: actor.name,
        end_reason: reason,
        status: nextStatus,
      })
      .eq("id", absenceId);

    if (updateError) {
      throw new Error(updateError.message);
    }

    await writeMemberCaseAuditLog({
      fieldName: "absence_ended",
      memberId: String(absence.member_id),
      newValue: JSON.stringify({
        absenceId,
        botRoleRemovalsQueued: (endingRows ?? []).length,
        status: nextStatus,
      }),
      reason,
      supabase,
    });

    revalidatePath("/", "layout");
    redirect(
      `/?section=representation&setup=${
        nextStatus === "ended" ? "absence-ended" : "absence-ending"
      }`,
    );
  } catch (error) {
    if (isRedirectError(error)) {
      throw error;
    }

    console.error("end member absence failed", {
      message: error instanceof Error ? error.message : String(error),
    });
    redirect("/?section=representation&setup=absence-error");
  }
}

export async function saveRepresentationMinistryRoleAction(formData: FormData) {
  if (!hasSupabasePublicEnv() || !hasSupabaseServerEnv()) {
    redirect("/?section=representation&setup=missing-supabase");
  }

  const ministryRoleId = getFormText(formData, "ministryRoleId") || null;
  const discordRoleId = getFormText(formData, "discordRoleId");
  const name = getFormText(formData, "name");
  const sortOrder = getOptionalFormNumber(formData, "sortOrder") ?? 100;

  if ((ministryRoleId && !isUuidText(ministryRoleId)) || !name || !isDiscordSnowflake(discordRoleId)) {
    redirect("/?section=representation&setup=ministry-role-missing");
  }

  const supabase = await createSupabaseServerClient();

  if (!(await hasMfaLevel2(supabase))) {
    redirect("/?section=representation&setup=ministry-role-aal2");
  }

  if (!(await hasPermission(supabase, "representations.manage"))) {
    redirect("/?section=representation&setup=ministry-role-denied");
  }

  const admin = getSupabaseAdminClient();
  const payload = {
    active: getFormBool(formData, "active"),
    discord_role_id: discordRoleId,
    name,
    sort_order: Math.max(0, Math.trunc(sortOrder)),
  };
  const query = ministryRoleId
    ? admin
        .from("representation_ministry_roles")
        .update(payload)
        .eq("id", ministryRoleId)
    : admin.from("representation_ministry_roles").insert(payload);
  const { error } = await query;

  if (error) {
    console.error("save representation ministry role failed", {
      code: error.code,
      details: error.details,
      message: error.message,
    });
    redirect("/?section=representation&setup=ministry-role-error");
  }

  revalidatePath("/", "layout");
  redirect(
    `/?section=representation&setup=${
      ministryRoleId ? "ministry-role-saved" : "ministry-role-created"
    }`,
  );
}

export async function saveRepresentationEligibilityAction(formData: FormData) {
  if (!hasSupabasePublicEnv() || !hasSupabaseServerEnv()) {
    redirect("/?section=representation&setup=missing-supabase");
  }

  const eligibilityId = getFormText(formData, "eligibilityId") || null;
  const memberId = getFormText(formData, "memberId");
  const ministryRoleIds = getFormList(formData, "ministryRoleIds").filter(isUuidText);
  const priority = getOptionalFormNumber(formData, "priority") ?? 100;
  const notes = getFormText(formData, "notes") || null;

  if ((eligibilityId && !isUuidText(eligibilityId)) || !isUuidText(memberId)) {
    redirect("/?section=representation&setup=representation-eligibility-missing");
  }

  if (ministryRoleIds.length === 0) {
    redirect("/?section=representation&setup=representation-eligibility-roles");
  }

  const supabase = await createSupabaseServerClient();

  if (!(await hasMfaLevel2(supabase))) {
    redirect("/?section=representation&setup=representation-eligibility-aal2");
  }

  if (!(await hasPermission(supabase, "representations.manage"))) {
    redirect("/?section=representation&setup=representation-eligibility-denied");
  }

  const admin = getSupabaseAdminClient();

  try {
    const { data: member, error: memberError } = await admin
      .from("members")
      .select("id,discord_id")
      .eq("id", memberId)
      .maybeSingle();

    if (memberError || !member?.id) {
      redirect("/?section=representation&setup=representation-eligibility-missing");
    }

    const representativeDiscordId = String(member.discord_id ?? "");

    if (!isDiscordSnowflake(representativeDiscordId)) {
      redirect("/?section=representation&setup=representation-eligibility-discord");
    }

    const payload = {
      active: getFormBool(formData, "active"),
      notes,
      priority: Math.max(0, Math.trunc(priority)),
      representative_discord_id: representativeDiscordId,
      representative_member_id: memberId,
    };
    const eligibilityQuery = eligibilityId
      ? admin
          .from("representation_eligibilities")
          .update(payload)
          .eq("id", eligibilityId)
          .select("id")
          .single()
      : admin
          .from("representation_eligibilities")
          .upsert(payload, { onConflict: "representative_member_id" })
          .select("id")
          .single();
    const { data: eligibility, error: eligibilityError } = await eligibilityQuery;

    if (eligibilityError || !eligibility?.id) {
      throw new Error(eligibilityError?.message ?? "eligibility write failed");
    }

    const targetEligibilityId = String(eligibility.id);
    const { error: deleteError } = await admin
      .from("representation_eligibility_ministry_roles")
      .delete()
      .eq("eligibility_id", targetEligibilityId);

    if (deleteError) {
      throw new Error(deleteError.message);
    }

    const { error: insertError } = await admin
      .from("representation_eligibility_ministry_roles")
      .insert(
        [...new Set(ministryRoleIds)].map((ministryRoleId) => ({
          eligibility_id: targetEligibilityId,
          ministry_role_id: ministryRoleId,
        })),
      );

    if (insertError) {
      throw new Error(insertError.message);
    }

    revalidatePath("/", "layout");
    redirect(
      `/?section=representation&setup=${
        eligibilityId
          ? "representation-eligibility-saved"
          : "representation-eligibility-created"
      }`,
    );
  } catch (error) {
    if (isRedirectError(error)) {
      throw error;
    }

    console.error("save representation eligibility failed", {
      message: error instanceof Error ? error.message : String(error),
    });
    redirect("/?section=representation&setup=representation-eligibility-error");
  }
}

export async function runModerationAction(formData: FormData) {
  if (!hasSupabasePublicEnv() || !hasSupabaseServerEnv()) {
    redirect("/?section=moderation&setup=moderation-action-failed");
  }

  const memberId = getFormText(formData, "memberId");
  const discordUserId = getFormText(formData, "discordUserId");
  const targetName = getFormText(formData, "targetName");
  const actionType = getFormText(formData, "actionType");
  const reason = getFormText(formData, "reason");
  const durationMode =
    getFormText(formData, "durationMode") === "timed" ? "timed" : "lifetime";
  const durationMinutes = getOptionalFormNumber(formData, "durationMinutes");

  if ((!memberId && !isDiscordSnowflake(discordUserId)) || !isModerationAction(actionType)) {
    redirect("/?section=moderation&setup=moderation-action-missing");
  }

  if (reason.length < 8) {
    redirect("/?section=moderation&setup=moderation-action-reason");
  }

  if (actionType === "timeout" && durationMode !== "timed") {
    redirect("/?section=moderation&setup=moderation-action-timeout-lifetime");
  }

  if (actionType === "timeout" && (!durationMinutes || durationMinutes < 1)) {
    redirect("/?section=moderation&setup=moderation-action-duration");
  }

  const supabase = await createSupabaseServerClient();

  if (!(await hasMfaLevel2(supabase))) {
    redirect("/?section=moderation&setup=moderation-action-aal2");
  }

  const { data: canManage } = await supabase.rpc("has_permission", {
    required_key: "moderation.manage",
  });

  if (canManage !== true) {
    redirect("/?section=moderation&setup=moderation-action-denied");
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: profile } = user
    ? await supabase
        .from("profiles")
        .select("display_name,username,email")
        .eq("id", user.id)
        .maybeSingle()
    : { data: null };
  const moderatorName = profile
    ? String(
        profile.display_name ?? profile.username ?? profile.email ?? "Website",
      )
    : "Website";

  try {
    await executeDiscordModerationAction({
      actionType,
      discordUserId: discordUserId || null,
      durationMode,
      durationSeconds:
        actionType === "timeout" ? Number(durationMinutes) * 60 : null,
      memberId: memberId || null,
      moderatorName,
      reason,
      targetName: targetName || null,
    });
  } catch (error) {
    console.error("discord moderation action failed", {
      message: error instanceof Error ? error.message : String(error),
    });
    redirect("/?section=moderation&setup=moderation-action-failed");
  }

  revalidatePath("/", "layout");
  redirect("/?section=moderation&setup=moderation-action-done");
}

export async function prepareModerationAdviceEvidenceUploadAction(input: {
  contentType?: string;
  evidenceType?: string;
  fileName?: string;
  size?: number;
}) {
  const { actor, admin } = await getModerationAdviceActionContext("advice-error");
  const originalName = sanitizeFileName(input.fileName || "beleg.bin");
  const contentType = input.contentType || "application/octet-stream";
  const evidenceType = input.evidenceType === "screenshot" ? "screenshot" : "file";
  const size = Number(input.size);

  if (
    !Number.isFinite(size) ||
    size <= 0 ||
    size > MAX_ADVICE_UPLOAD_BYTES ||
    !isAdviceUploadTypeAllowed({ contentType, fileName: originalName })
  ) {
    throw new Error("Diese Belegdatei ist fuer den Upload nicht erlaubt.");
  }

  const storagePath = `${ADVICE_STAGING_PREFIX}/${actor.id}/${crypto.randomUUID()}-${originalName}`;
  const { data, error } = await admin.storage
    .from(FILE_BUCKET)
    .createSignedUploadUrl(storagePath);

  if (error || !data?.token || !data.path) {
    throw new Error(error?.message ?? "Upload konnte nicht vorbereitet werden.");
  }

  return {
    contentType,
    evidenceType,
    originalName,
    path: data.path,
    size,
    token: data.token,
  };
}

export async function createModerationAdviceCaseAction(formData: FormData) {
  const { actor, admin } = await getModerationAdviceActionContext("advice-error");
  const targetMemberId = getFormText(formData, "targetMemberId");
  const discordUserId = getFormText(formData, "targetDiscordUserId");
  const targetDiscordUsername = getFormText(formData, "targetDiscordUsername");
  const incidentAt = getOptionalIsoDate(formData, "incidentAt");
  const situationText = getFormText(formData, "situationText");
  const behaviorSummary = getFormText(formData, "behaviorSummary");
  const affectedPeople = getFormText(formData, "affectedPeople");
  const internalNotes = getFormText(formData, "internalNotes");
  const desiredOutcome = getFormText(formData, "desiredOutcome");
  const title = getFormText(formData, "title");
  const intent = getFormText(formData, "intent") === "analyze" ? "analyze" : "create";
  const files = getAdviceUploadFiles(formData);
  const uploadedEvidence = getUploadedAdviceEvidence(formData);

  if (!uploadedEvidence) {
    redirect("/?section=advice&setup=advice-upload-type");
  }

  if (targetMemberId && !isUuidText(targetMemberId)) {
    redirect("/?section=advice&setup=advice-target");
  }

  if (discordUserId && !isDiscordSnowflake(discordUserId)) {
    redirect("/?section=advice&setup=advice-target");
  }

  if (!targetMemberId && !discordUserId && !targetDiscordUsername) {
    redirect("/?section=advice&setup=advice-target");
  }

  if (situationText.length < 20 || behaviorSummary.length < 8) {
    redirect("/?section=advice&setup=advice-description");
  }

  const uploadCount = files.length + uploadedEvidence.length;
  const uploadTotalBytes =
    files.reduce((total, file) => total + file.size, 0) +
    uploadedEvidence.reduce((total, evidence) => total + evidence.size, 0);

  if (uploadCount > MAX_ADVICE_UPLOADS) {
    redirect("/?section=advice&setup=advice-upload-count");
  }

  if (uploadTotalBytes > MAX_ADVICE_TOTAL_UPLOAD_BYTES) {
    redirect("/?section=advice&setup=advice-upload-total");
  }

  if (
    files.some((file) => file.size <= 0 || file.size > MAX_ADVICE_UPLOAD_BYTES) ||
    uploadedEvidence.some(
      (evidence) => evidence.size <= 0 || evidence.size > MAX_ADVICE_UPLOAD_BYTES,
    )
  ) {
    redirect("/?section=advice&setup=advice-upload-size");
  }

  if (!areAdviceUploadTypesAllowed(files) || !areUploadedAdviceEvidenceAllowed(uploadedEvidence)) {
    redirect("/?section=advice&setup=advice-upload-type");
  }

  const targetMember = targetMemberId
    ? await getAdviceTargetMember(admin, targetMemberId)
    : null;

  if (targetMemberId && !targetMember) {
    redirect("/?section=advice&setup=advice-target");
  }

  const targetDiscordId =
    asActionText(targetMember?.discord_id) || discordUserId || null;
  const resolvedTargetName =
    targetDiscordUsername ||
    asActionText(targetMember?.discord_display_name) ||
    asActionText(targetMember?.discord_username) ||
    asActionText(targetMember?.name) ||
    targetDiscordId ||
    "Unbekannte Zielperson";

  const { data: adviceCase, error } = await admin
    .from("moderation_advice_cases")
    .insert({
      affected_people: affectedPeople,
      behavior_summary: behaviorSummary,
      desired_outcome: desiredOutcome,
      incident_at: incidentAt,
      internal_notes: internalNotes,
      situation_text: situationText,
      status: "draft",
      submitted_by: actor.id,
      target_discord_user_id: targetDiscordId,
      target_discord_username: resolvedTargetName,
      target_member_id: targetMemberId || null,
      title:
        title ||
        `Beratung ${resolvedTargetName}`.slice(0, 140) ||
        "Neue Beratung",
    })
    .select("id,case_number")
    .single();

  if (error || !adviceCase?.id) {
    console.error("moderation advice create failed", {
      code: error?.code,
      details: error?.details,
      message: error?.message,
    });
    redirect("/?section=advice&setup=advice-error");
  }

  const caseId = String(adviceCase.id);
  await writeModerationAdviceLog(admin, {
    action: "beratung_erstellt",
    actorId: actor.id,
    caseId,
    details: {
      actorName: actor.name,
      caseNumber: adviceCase.case_number,
      targetDiscordId,
      targetMemberId: targetMemberId || null,
    },
  });

  try {
    await insertModerationAdviceEvidence({
      actorId: actor.id,
      admin,
      caseId,
      files,
      formData,
      uploadedEvidence,
    });

    if (intent === "analyze") {
      await analyzeModerationAdviceCase({
        actorId: actor.id,
        actorName: actor.name,
        caseId,
      });
    }
  } catch (error) {
    console.error("moderation advice evidence/analyze failed", {
      message: error instanceof Error ? error.message : String(error),
    });
    redirect(`/?section=advice&advice=${encodeURIComponent(caseId)}&setup=advice-error`);
  }

  revalidatePath("/", "layout");
  redirect(
    `/?section=advice&advice=${encodeURIComponent(caseId)}&setup=${
      intent === "analyze" ? "advice-ready" : "advice-created"
    }`,
  );
}

export async function analyzeModerationAdviceCaseAction(formData: FormData) {
  const { actor } = await getModerationAdviceActionContext("advice-error");
  const caseId = getFormText(formData, "caseId");

  if (!isUuidText(caseId)) {
    redirect("/?section=advice&setup=advice-missing");
  }

  try {
    await analyzeModerationAdviceCase({
      actorId: actor.id,
      actorName: actor.name,
      caseId,
    });
  } catch (error) {
    console.error("moderation advice analyze failed", {
      message: error instanceof Error ? error.message : String(error),
    });
    redirect(`/?section=advice&advice=${encodeURIComponent(caseId)}&setup=advice-error`);
  }

  revalidatePath("/", "layout");
  redirect(`/?section=advice&advice=${encodeURIComponent(caseId)}&setup=advice-ready`);
}

export async function saveModerationAdviceCaseAction(formData: FormData) {
  const { actor, admin } = await getModerationAdviceActionContext("advice-error");
  const caseId = getFormText(formData, "caseId");
  const reason = getFormText(formData, "recommendedReason");

  if (!isUuidText(caseId)) {
    redirect("/?section=advice&setup=advice-missing");
  }

  const { error } = await admin
    .from("moderation_advice_cases")
    .update({
      recommended_reason: reason || null,
      status: "saved",
    })
    .eq("id", caseId)
    .not("status", "in", "(queued,executed)");

  if (error) {
    console.error("moderation advice save failed", {
      code: error.code,
      details: error.details,
      message: error.message,
    });
    redirect(`/?section=advice&advice=${encodeURIComponent(caseId)}&setup=advice-error`);
  }

  await writeModerationAdviceLog(admin, {
    action: "beratung_gespeichert",
    actorId: actor.id,
    caseId,
    details: { actorName: actor.name },
  });

  revalidatePath("/", "layout");
  redirect(`/?section=advice&advice=${encodeURIComponent(caseId)}&setup=advice-saved`);
}

export async function updateModerationAdviceTitleAction(formData: FormData) {
  const { actor, admin } = await getModerationAdviceActionContext("advice-error");
  const caseId = getFormText(formData, "caseId");
  const title = getFormText(formData, "title");

  if (!isUuidText(caseId)) {
    redirect("/?section=advice&setup=advice-missing");
  }

  if (title.length < 2 || title.length > 140) {
    redirect(`/?section=advice&advice=${encodeURIComponent(caseId)}&setup=advice-title`);
  }

  const { error } = await admin
    .from("moderation_advice_cases")
    .update({ title })
    .eq("id", caseId);

  if (error) {
    console.error("moderation advice title failed", {
      code: error.code,
      details: error.details,
      message: error.message,
    });
    redirect(`/?section=advice&advice=${encodeURIComponent(caseId)}&setup=advice-error`);
  }

  await writeModerationAdviceLog(admin, {
    action: "titel_geaendert",
    actorId: actor.id,
    caseId,
    details: { actorName: actor.name, title },
  });

  revalidatePath("/", "layout");
  redirect(`/?section=advice&advice=${encodeURIComponent(caseId)}&setup=advice-title-saved`);
}

export async function executeModerationAdviceAction(formData: FormData) {
  const { actor } = await getModerationAdviceActionContext("advice-error");
  const caseId = getFormText(formData, "caseId");
  const reasonOverride = getFormText(formData, "reasonOverride");

  if (!isUuidText(caseId)) {
    redirect("/?section=advice&setup=advice-missing");
  }

  try {
    await queueModerationAdviceExecution({
      actorId: actor.id,
      actorName: actor.name,
      caseId,
      reasonOverride,
    });
  } catch (error) {
    console.error("moderation advice execute failed", {
      message: error instanceof Error ? error.message : String(error),
    });
    redirect(`/?section=advice&advice=${encodeURIComponent(caseId)}&setup=advice-execute-failed`);
  }

  revalidatePath("/", "layout");
  redirect(`/?section=advice&advice=${encodeURIComponent(caseId)}&setup=advice-queued`);
}

export async function createModerationAdviceOfficialDocumentAction(
  formData: FormData,
) {
  const { actor } = await getModerationAdviceActionContext("advice-error");
  const caseId = getFormText(formData, "caseId");
  const documentType = getOfficialAdviceDocumentType(formData);
  const periodMonth = getOptionalFormNumber(formData, "periodMonth");
  const periodYear = getOptionalFormNumber(formData, "periodYear");
  const folderId = getFormText(formData, "folderId");

  if (!isUuidText(caseId)) {
    redirect("/?section=advice&setup=advice-missing");
  }

  if (folderId && !isUuidText(folderId)) {
    redirect(`/?section=advice&advice=${encodeURIComponent(caseId)}&setup=advice-document-folder`);
  }

  try {
    await createOfficialModerationAdviceDocument({
      actorId: actor.id,
      actorName: actor.name,
      caseId,
      documentType,
      folderId: folderId || undefined,
      periodMonth: periodMonth ?? undefined,
      periodYear: periodYear ?? undefined,
    });
  } catch (error) {
    console.error("moderation advice official document failed", {
      message: error instanceof Error ? error.message : String(error),
    });
    redirect(
      `/?section=advice&advice=${encodeURIComponent(
        caseId,
      )}&setup=${getOfficialAdviceDocumentErrorSetup(error)}`,
    );
  }

  revalidatePath("/", "layout");
  redirect(
    `/?section=advice&advice=${encodeURIComponent(
      caseId,
    )}&setup=advice-document-created`,
  );
}

export async function activateLockdownAction(formData: FormData) {
  if (!hasSupabasePublicEnv()) {
    redirect("/?section=settings&setup=missing-supabase");
  }

  const reason = getFormText(formData, "reason");
  const recipientDiscordIds = getFormList(formData, "recipientDiscordIds")
    .flatMap((value) => value.split(/[,\s]+/))
    .map((value) => value.trim())
    .filter((value) => /^[0-9]{15,25}$/.test(value))
    .slice(0, 6);
  const recipientUsernames = [
    ...new Set([
      "losoverdrive",
      ...getFormList(formData, "recipientUsernames")
        .flatMap((value) => value.split(/[,;\n]+/))
        .map((value) => value.trim())
        .filter(Boolean),
    ]),
  ].slice(0, 8);
  const importantChannelIds = getFormList(formData, "importantChannelIds")
    .flatMap((value) => value.split(/[,\s]+/))
    .map((value) => value.trim())
    .filter((value) => /^[0-9]{15,25}$/.test(value))
    .slice(0, 20);

  if (reason.length < 8) {
    redirect("/?section=settings&setup=lockdown-reason");
  }

  const supabase = await createSupabaseServerClient();

  if (!(await hasMfaLevel2(supabase))) {
    redirect("/?section=settings&setup=lockdown-aal2");
  }

  const { error } = await supabase.rpc("activate_system_lockdown", {
    p_important_channel_ids: importantChannelIds,
    p_reason: reason,
    p_recipient_discord_ids: recipientDiscordIds,
    p_recipient_usernames: recipientUsernames,
  });

  if (error) {
    console.error("activate_system_lockdown failed", {
      code: error.code,
      details: error.details,
      message: error.message,
    });

    if (error.message.toLowerCase().includes("lockdown bot offline")) {
      redirect("/?section=settings&setup=lockdown-bot-offline");
    }

    redirect("/?section=settings&setup=lockdown-failed");
  }

  revalidatePath("/", "layout");
  redirect("/?section=settings&setup=lockdown-activated");
}

export async function deactivateLockdownAction(formData: FormData) {
  if (!hasSupabasePublicEnv()) {
    redirect("/?section=settings&setup=missing-supabase");
  }

  const reason = getFormText(formData, "reason");
  const emergencyCode = getFormText(formData, "emergencyCode");

  if (reason.length < 8) {
    redirect("/?section=settings&setup=lockdown-reason");
  }

  const supabase = await createSupabaseServerClient();

  if (!(await hasMfaLevel2(supabase)) && emergencyCode.length < 8) {
    redirect("/?section=settings&setup=lockdown-aal2");
  }

  const { error } = await supabase.rpc("deactivate_system_lockdown", {
    p_emergency_code: emergencyCode || null,
    p_reason: reason,
  });

  if (error) {
    console.error("deactivate_system_lockdown failed", {
      code: error.code,
      details: error.details,
      message: error.message,
    });
    redirect("/?section=settings&setup=lockdown-failed");
  }

  revalidatePath("/", "layout");
  redirect("/?section=settings&setup=lockdown-deactivated");
}

export async function saveTemporaryDesignSettingsAction(formData: FormData) {
  if (!hasSupabasePublicEnv() || !hasSupabaseServerEnv()) {
    redirect("/?section=settings&setup=missing-supabase");
  }

  const supabase = await createSupabaseServerClient();
  const actor = await requireTemporaryDesignManager(supabase);
  const admin = getSupabaseAdminClient();
  const manualTemplateKey = getFormText(formData, "manualTemplateKey");
  const manualStartDate = getOptionalDateText(formData, "manualStartDate");
  const manualEndDate = getOptionalDateText(formData, "manualEndDate");

  if (manualStartDate && manualEndDate && manualStartDate > manualEndDate) {
    redirect("/?section=settings&setup=temporary-design-range");
  }

  const { error } = await admin.from("temporary_design_settings").upsert({
    automatic_enabled: formData.get("automaticEnabled") === "on",
    enabled: formData.get("enabled") === "on",
    id: true,
    manual_enabled: formData.get("manualEnabled") === "on",
    manual_end_date: manualEndDate || null,
    manual_priority: clampInteger(getOptionalFormNumber(formData, "manualPriority"), 0, 999, 100),
    manual_start_date: manualStartDate || null,
    manual_template_key: manualTemplateKey || null,
    updated_by: actor.id,
  });

  if (error) {
    console.error("temporary design settings save failed", {
      code: error.code,
      details: error.details,
      message: error.message,
    });
    redirect(getTemporaryDesignErrorRedirect(error.message));
  }

  revalidatePath("/", "layout");
  redirect("/?section=settings&setup=temporary-design-saved");
}

export async function resetTemporaryDesignSettingsAction() {
  if (!hasSupabasePublicEnv() || !hasSupabaseServerEnv()) {
    redirect("/?section=settings&setup=missing-supabase");
  }

  const supabase = await createSupabaseServerClient();
  const actor = await requireTemporaryDesignManager(supabase);
  const admin = getSupabaseAdminClient();
  const { error } = await admin.from("temporary_design_settings").upsert({
    automatic_enabled: true,
    enabled: true,
    id: true,
    manual_enabled: false,
    manual_end_date: null,
    manual_priority: 100,
    manual_start_date: null,
    manual_template_key: null,
    updated_by: actor.id,
  });

  if (error) {
    console.error("temporary design settings reset failed", {
      code: error.code,
      details: error.details,
      message: error.message,
    });
    redirect(getTemporaryDesignErrorRedirect(error.message));
  }

  revalidatePath("/", "layout");
  redirect("/?section=settings&setup=temporary-design-reset");
}

export async function saveTemporaryDesignTemplateAction(formData: FormData) {
  if (!hasSupabasePublicEnv() || !hasSupabaseServerEnv()) {
    redirect("/?section=settings&setup=missing-supabase");
  }

  const supabase = await createSupabaseServerClient();
  const actor = await requireTemporaryDesignManager(supabase);
  const admin = getSupabaseAdminClient();
  const key = getFormText(formData, "templateKey").toLowerCase();
  const name = getFormText(formData, "templateName");
  const eventName = getFormText(formData, "eventName") || name;
  const startDate = getFlexibleDateText(formData, "startDate");
  const endDate = getFlexibleDateText(formData, "endDate");
  const dynamicDate = getAllowedDynamicDate(getFormText(formData, "dynamicDate"));
  const backgroundClass =
    getThemeClassText(formData, "backgroundClass") || `theme-${key}`;

  if (!/^[a-z0-9][a-z0-9-]{1,80}$/.test(key) || name.length < 2) {
    redirect("/?section=settings&setup=temporary-design-template");
  }

  if (startDate && endDate && startDate.length === 10 && endDate.length === 10 && startDate > endDate) {
    redirect("/?section=settings&setup=temporary-design-range");
  }

  const { error } = await admin.from("temporary_design_templates").upsert({
    dynamic_date: dynamicDate || null,
    enabled: formData.get("templateEnabled") === "on",
    end_date: endDate || null,
    end_offset_days: clampInteger(getOptionalFormNumber(formData, "endOffsetDays"), -14, 14, 0),
    event_name: eventName,
    key,
    manual_only: formData.get("manualOnly") === "on",
    name,
    priority: clampInteger(getOptionalFormNumber(formData, "priority"), 0, 999, 0),
    recurring: formData.get("recurring") === "on",
    start_date: startDate || null,
    start_offset_days: clampInteger(getOptionalFormNumber(formData, "startOffsetDays"), -14, 14, 0),
    theme: {
      accentColor: getColorText(formData, "accentColor", "#263f72"),
      accentSoftColor: getColorText(formData, "accentSoftColor", "#d7dfed"),
      accentStrongColor: getColorText(formData, "accentStrongColor", "#14284d"),
      backgroundClass,
      backgroundColor: getColorText(formData, "backgroundColor", "#c7cbc8"),
      bannerEnabled: formData.get("bannerEnabled") === "on",
      bannerLabel: getFormText(formData, "bannerLabel"),
      buttonColor: getColorText(formData, "buttonColor", "#111111"),
      decoration: getSafeTokenText(formData, "decoration"),
      headerStyle: getSafeTokenText(formData, "headerStyle") || "default",
    },
    updated_by: actor.id,
  });

  if (error) {
    console.error("temporary design template save failed", {
      code: error.code,
      details: error.details,
      message: error.message,
    });
    redirect(getTemporaryDesignErrorRedirect(error.message));
  }

  revalidatePath("/", "layout");
  redirect("/?section=settings&setup=temporary-design-template-saved");
}

export async function activateTemporaryDesignTemplateAction(formData: FormData) {
  if (!hasSupabasePublicEnv() || !hasSupabaseServerEnv()) {
    redirect("/?section=settings&setup=missing-supabase");
  }

  const supabase = await createSupabaseServerClient();
  const actor = await requireTemporaryDesignManager(supabase);
  const admin = getSupabaseAdminClient();
  const templateKey = getFormText(formData, "templateKey");

  if (!/^[a-z0-9][a-z0-9-]{1,80}$/.test(templateKey)) {
    redirect("/?section=settings&setup=temporary-design-template");
  }

  const { error } = await admin.from("temporary_design_settings").upsert({
    automatic_enabled: true,
    enabled: true,
    id: true,
    manual_enabled: true,
    manual_end_date: null,
    manual_priority: 900,
    manual_start_date: null,
    manual_template_key: templateKey,
    updated_by: actor.id,
  });

  if (error) {
    console.error("temporary design activation failed", {
      code: error.code,
      details: error.details,
      message: error.message,
    });
    redirect(getTemporaryDesignErrorRedirect(error.message));
  }

  revalidatePath("/", "layout");
  redirect("/?section=settings&setup=temporary-design-activated");
}

export async function updateModerationEventAction(formData: FormData) {
  if (!hasSupabasePublicEnv() || !hasSupabaseServerEnv()) {
    redirect("/?section=members&setup=moderation-event-failed");
  }

  const eventId = getFormText(formData, "eventId");
  const memberId = getFormText(formData, "memberId");
  const eventType = getFormText(formData, "eventType");
  const status = getFormText(formData, "status");
  const reason = getFormText(formData, "reason");
  const durationMinutes = getOptionalFormNumber(formData, "durationMinutes");

  if (!isUuidText(eventId) || !isUuidText(memberId) || !isModerationAction(eventType)) {
    redirect(`/?section=members&member=${encodeURIComponent(memberId)}&setup=moderation-event-missing`);
  }

  if (!isModerationStatus(status)) {
    redirect(`/?section=members&member=${encodeURIComponent(memberId)}&setup=moderation-event-missing`);
  }

  if (reason.length < 8) {
    redirect(`/?section=members&member=${encodeURIComponent(memberId)}&setup=moderation-event-reason`);
  }

  const supabase = await createSupabaseServerClient();

  if (!(await hasMfaLevel2(supabase))) {
    redirect(`/?section=members&member=${encodeURIComponent(memberId)}&setup=moderation-event-aal2`);
  }

  const { data: canManage } = await supabase.rpc("has_permission", {
    required_key: "moderation.manage",
  });

  if (canManage !== true) {
    redirect(`/?section=members&member=${encodeURIComponent(memberId)}&setup=moderation-event-denied`);
  }

  const admin = getSupabaseAdminClient();
  const event = await getModerationEventForMember(admin, eventId, memberId);

  if (!event) {
    redirect(`/?section=members&member=${encodeURIComponent(memberId)}&setup=moderation-event-missing`);
  }

  if (isLiveCommandStatus(getRecordMetadata(event.metadata).commandStatus)) {
    redirect(`/?section=members&member=${encodeURIComponent(memberId)}&setup=moderation-event-running`);
  }

  const durationSeconds =
    eventType === "timeout" && durationMinutes && durationMinutes > 0
      ? Math.round(durationMinutes * 60)
      : null;
  const endedAt =
    eventType === "timeout" && durationSeconds
      ? new Date(Date.now() + durationSeconds * 1000).toISOString()
      : null;
  const lifetime = eventType === "ban" && status === "active";
  const metadata = getRecordMetadata(event.metadata);

  const { error } = await admin
    .from("discord_moderation_events")
    .update({
      duration_seconds: durationSeconds,
      ended_at: endedAt,
      event_type: eventType,
      last_synced_at: new Date().toISOString(),
      metadata: {
        ...metadata,
        editedFromWebsite: true,
        durationMode:
          eventType === "timeout" ? "timed" : lifetime ? "lifetime" : "record",
        lifetime,
      },
      member_id: memberId,
      reason,
      status,
    })
    .eq("id", eventId);

  if (error) {
    console.error("moderation event update failed", {
      code: error.code,
      details: error.details,
      message: error.message,
    });
    redirect(`/?section=members&member=${encodeURIComponent(memberId)}&setup=moderation-event-failed`);
  }

  await writeMemberCaseAuditLog({
    fieldName: "moderation_event",
    memberId,
    newValue: eventId,
    reason,
    supabase,
  });

  revalidatePath("/", "layout");
  redirect(`/?section=members&member=${encodeURIComponent(memberId)}&setup=moderation-event-updated`);
}

export async function deleteModerationEventAction(formData: FormData) {
  if (!hasSupabasePublicEnv() || !hasSupabaseServerEnv()) {
    redirect("/?section=members&setup=moderation-event-failed");
  }

  const eventId = getFormText(formData, "eventId");
  const memberId = getFormText(formData, "memberId");
  const reason = getFormText(formData, "reason");

  if (!isUuidText(eventId) || !isUuidText(memberId)) {
    redirect(`/?section=members&member=${encodeURIComponent(memberId)}&setup=moderation-event-missing`);
  }

  if (reason.length < 8) {
    redirect(`/?section=members&member=${encodeURIComponent(memberId)}&setup=moderation-event-reason`);
  }

  const supabase = await createSupabaseServerClient();

  if (!(await hasMfaLevel2(supabase))) {
    redirect(`/?section=members&member=${encodeURIComponent(memberId)}&setup=moderation-event-aal2`);
  }

  const { data: canManage } = await supabase.rpc("has_permission", {
    required_key: "moderation.manage",
  });

  if (canManage !== true) {
    redirect(`/?section=members&member=${encodeURIComponent(memberId)}&setup=moderation-event-denied`);
  }

  const admin = getSupabaseAdminClient();
  const event = await getModerationEventForMember(admin, eventId, memberId);

  if (!event) {
    redirect(`/?section=members&member=${encodeURIComponent(memberId)}&setup=moderation-event-missing`);
  }

  if (isLiveCommandStatus(getRecordMetadata(event.metadata).commandStatus)) {
    redirect(`/?section=members&member=${encodeURIComponent(memberId)}&setup=moderation-event-running`);
  }

  const { error } = await admin
    .from("discord_moderation_events")
    .delete()
    .eq("id", eventId);

  if (error) {
    console.error("moderation event delete failed", {
      code: error.code,
      details: error.details,
      message: error.message,
    });
    redirect(`/?section=members&member=${encodeURIComponent(memberId)}&setup=moderation-event-failed`);
  }

  await writeMemberCaseAuditLog({
    fieldName: "moderation_event_deleted",
    memberId,
    oldValue: eventId,
    reason,
    supabase,
  });

  revalidatePath("/", "layout");
  redirect(`/?section=members&member=${encodeURIComponent(memberId)}&setup=moderation-event-deleted`);
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

  const { data: folderId, error } = await supabase.rpc("create_folder_record", {
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

  if (isUuidText(String(folderId ?? ""))) {
    try {
      await ensureFolderRecordOnDrive(String(folderId));
    } catch (driveError) {
      console.error("drive folder create sync failed", {
        message:
          driveError instanceof Error ? driveError.message : String(driveError),
      });
    }
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

export async function uploadFileAction(formData: FormData) {
  if (!hasSupabasePublicEnv()) {
    redirect("/?section=files&setup=missing-supabase");
  }

  const files = [
    ...formData.getAll("files"),
    ...formData.getAll("file"),
  ].filter((value): value is File => value instanceof File && value.size > 0);
  const categoryId = getFormText(formData, "categoryId");
  const folderId = getFormText(formData, "folderId") || null;

  if (files.length === 0 || !categoryId) {
    redirect("/?section=files&setup=file-upload-missing");
  }

  if (files.some((file) => file.size <= 0 || file.size > MAX_UPLOAD_BYTES)) {
    redirect("/?section=files&setup=file-upload-size");
  }

  const supabase = await createSupabaseServerClient();

  if (!(await hasMfaLevel2(supabase))) {
    redirect("/?section=files&setup=file-upload-aal2");
  }

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    redirect("/?section=files&setup=file-upload-permission");
  }

  let uploaded = 0;
  let failed = 0;
  let driveWarnings = 0;
  const admin = getSupabaseAdminClient();
  const uploadFolderCache = new Map<string, string | null>();
  const tags = getFormTags(formData, "tags");
  const description = getFormText(formData, "description") || null;

  for (const file of files) {
    const uploadPathParts = getUploadPathParts(file);
    const originalName = uploadPathParts.at(-1) || file.name || "upload.bin";
    const fileType = file.type || "application/octet-stream";
    const storagePath = buildStoragePath(user.id, originalName);
    const fileBody = new Uint8Array(await file.arrayBuffer());
    let targetFolderId = folderId;

    if (uploadPathParts.length > 1) {
      try {
        targetFolderId = await ensureNestedUploadFolder({
          admin,
          baseFolderId: folderId,
          cache: uploadFolderCache,
          categoryId,
          folderNames: uploadPathParts.slice(0, -1),
          supabase,
        });
      } catch (folderError) {
        failed += 1;
        console.error("folder upload path create failed", {
          file: originalName,
          message:
            folderError instanceof Error ? folderError.message : String(folderError),
        });
        continue;
      }
    }

    const { error: uploadError } = await supabase.storage
      .from(FILE_BUCKET)
      .upload(storagePath, fileBody, {
        contentType: fileType,
        upsert: false,
      });

    if (uploadError) {
      failed += 1;
      console.error("storage upload failed", {
        file: originalName,
        message: uploadError.message,
      });
      continue;
    }

    const { data: fileId, error } = await supabase.rpc("register_uploaded_file", {
      p_category_id: categoryId,
      p_description: description,
      p_file_size: file.size,
      p_file_type: fileType,
      p_folder_id: targetFolderId,
      p_original_filename: originalName,
      p_storage_path: storagePath,
      p_tags: tags,
    });

    if (error || !isUuidText(String(fileId ?? ""))) {
      failed += 1;
      await supabase.storage.from(FILE_BUCKET).remove([storagePath]);
      console.error("register_uploaded_file failed", {
        code: error?.code,
        details: error?.details,
        file: originalName,
        message: error?.message,
      });
      continue;
    }

    uploaded += 1;

    try {
      const driveResult = await uploadFileRecordToDrive(String(fileId));

      if (!driveResult.ok) {
        driveWarnings += 1;
      }
    } catch (driveError) {
      driveWarnings += 1;
      console.error("drive upload after file upload failed", {
        file: originalName,
        message:
          driveError instanceof Error ? driveError.message : String(driveError),
      });
    }
  }

  if (uploaded === 0) {
    redirect(
      `/?section=files&setup=${
        failed > 0 ? "file-upload-storage" : "file-upload-error"
      }`,
    );
  }

  revalidatePath("/", "layout");
  redirect(
    `/?section=files&setup=${
      failed > 0
        ? "file-upload-partial"
        : driveWarnings > 0
          ? "file-uploaded-drive-pending"
          : "file-uploaded"
    }`,
  );
}

export async function runDriveManualSyncAction() {
  if (!hasSupabasePublicEnv() || !hasSupabaseServerEnv()) {
    redirect("/?section=files&setup=missing-supabase");
  }

  const supabase = await createSupabaseServerClient();

  if (!(await hasMfaLevel2(supabase))) {
    redirect("/?section=files&setup=drive-sync-aal2");
  }

  const { data: canSync } = await supabase.rpc("has_permission", {
    required_key: "sync.manage",
  });
  const { data: canManageFiles } = await supabase.rpc("has_permission", {
    required_key: "files.manage",
  });

  if (canSync !== true && canManageFiles !== true) {
    redirect("/?section=files&setup=drive-sync-denied");
  }

  const actor = await getActionActor(supabase);

  let setup = "drive-sync-started";

  try {
    const result = await runDriveSync({
      triggeredBy: actor.id,
      triggerType: "manual",
    });

    setup =
      result.skipped
        ? "drive-sync-running"
        : result.status === "partial"
          ? "drive-sync-partial"
          : "drive-sync-started";
  } catch (error) {
    console.error("manual drive sync failed", {
      message: error instanceof Error ? error.message : String(error),
    });
    redirect("/?section=files&setup=drive-sync-failed");
  }

  revalidatePath("/", "layout");
  redirect(`/?section=files&setup=${setup}`);
}

export async function createGoogleDocAction(formData: FormData) {
  if (!hasSupabasePublicEnv() || !hasSupabaseServerEnv()) {
    redirect("/?section=files&setup=missing-supabase");
  }

  const folderId = getFormText(formData, "folderId");
  const name = getFormText(formData, "documentName");

  if (!isUuidText(folderId) || name.length < 2) {
    redirect("/?section=files&setup=google-doc-missing");
  }

  const supabase = await createSupabaseServerClient();

  if (!(await hasMfaLevel2(supabase))) {
    redirect("/?section=files&setup=google-doc-aal2");
  }

  const { data: canUploadFiles } = await supabase.rpc("has_permission", {
    required_key: "files.upload",
  });
  const { data: canEditFiles } = await supabase.rpc("has_permission", {
    required_key: "files.edit",
  });

  if (canUploadFiles !== true || canEditFiles !== true) {
    redirect("/?section=files&setup=google-doc-denied");
  }

  if (!(await hasFolderActionPermission(supabase, folderId, "upload"))) {
    redirect("/?section=files&setup=google-doc-denied");
  }

  const actor = await getActionActor(supabase);

  let fileId = "";

  try {
    const result = await createGoogleDocFromTemplate({
      actorId: actor.id,
      description: getFormText(formData, "description") || null,
      folderId,
      name,
      tags: getFormTags(formData, "tags"),
    });

    fileId = result.fileId;
  } catch (error) {
    console.error("google doc create failed", {
      message: error instanceof Error ? error.message : String(error),
    });
    redirect(`/?section=files&setup=${getGoogleDocErrorSetup(error)}`);
  }

  revalidatePath("/", "layout");
  redirect(
    `/files/preview?fileId=${encodeURIComponent(
      fileId,
    )}&setup=google-doc-created`,
  );
}

export async function downloadFileAction(formData: FormData) {
  if (!hasSupabasePublicEnv() || !hasSupabaseServerEnv()) {
    redirect("/?section=files&setup=missing-supabase");
  }

  const fileId = getFormText(formData, "fileId");

  if (!isUuidText(fileId)) {
    redirect("/?section=files&setup=file-download-missing");
  }

  const supabase = await createSupabaseServerClient();

  if (!(await hasMfaLevel2(supabase))) {
    redirect("/?section=files&setup=file-download-aal2");
  }

  const { data: canDownload } = await supabase.rpc("has_permission", {
    required_key: "files.download",
  });
  const { data: canViewFiles } = await supabase.rpc("has_permission", {
    required_key: "files.view",
  });

  if (canDownload !== true || canViewFiles !== true) {
    redirect("/?section=files&setup=file-download-permission");
  }

  const admin = getSupabaseAdminClient();
  const { data: fileRow, error: fileError } = await admin
    .from("files")
    .select("storage_path,external_url")
    .eq("id", fileId)
    .single();

  if (fileError || (!fileRow?.storage_path && !fileRow?.external_url)) {
    console.error("download file lookup failed", {
      code: fileError?.code,
      details: fileError?.details,
      message: fileError?.message,
    });
    redirect(`/?section=files&setup=${getFileDownloadErrorSetup(fileError)}`);
  }

  const externalUrl = String(fileRow.external_url ?? "").trim();

  if (externalUrl) {
    redirect(externalUrl);
  }

  const { data, error } = await admin.storage
    .from(FILE_BUCKET)
    .createSignedUrl(String(fileRow.storage_path), 60);

  if (error || !data?.signedUrl) {
    console.error("create signed file url failed", {
      message: error?.message,
    });
    redirect(`/?section=files&setup=${getFileDownloadErrorSetup(error)}`);
  }

  redirect(data.signedUrl);
}

export async function moveFileAction(formData: FormData) {
  if (!hasSupabasePublicEnv() || !hasSupabaseServerEnv()) {
    redirect("/?section=files&setup=missing-supabase");
  }

  const fileId = getFormText(formData, "fileId");
  const categoryId = getFormText(formData, "categoryId");
  const folderId = getFormText(formData, "folderId") || null;
  const reason = getFormText(formData, "reason");

  if (!isUuidText(fileId) || !isUuidText(categoryId)) {
    redirect("/?section=files&setup=file-move-missing");
  }

  if (folderId && !isUuidText(folderId)) {
    redirect("/?section=files&setup=file-move-folder");
  }

  const supabase = await createSupabaseServerClient();

  if (!(await hasMfaLevel2(supabase))) {
    redirect("/?section=files&setup=file-move-aal2");
  }

  const { data: canViewFiles } = await supabase.rpc("has_permission", {
    required_key: "files.view",
  });
  const { data: canEditFiles } = await supabase.rpc("has_permission", {
    required_key: "files.edit",
  });

  if (canViewFiles !== true || canEditFiles !== true) {
    redirect("/?section=files&setup=file-move-permission");
  }

  const admin = getSupabaseAdminClient();
  const file = await getFileActionRow(admin, fileId);

  if (!file) {
    redirect("/?section=files&setup=file-move-missing");
  }

  if (!(await hasFolderActionPermission(supabase, file.folder_id, "edit"))) {
    redirect("/?section=files&setup=file-move-permission");
  }

  const target = await resolveFileMoveTarget(admin, folderId, categoryId);

  if (!target) {
    redirect("/?section=files&setup=file-move-category");
  }

  if (!(await hasFolderActionPermission(supabase, target.folderId, "edit"))) {
    redirect("/?section=files&setup=file-move-permission");
  }

  const { error } = await admin
    .from("files")
    .update({
      category_id: target.categoryId,
      folder_id: target.folderId,
    })
    .eq("id", fileId);

  if (error) {
    console.error("move file failed", {
      code: error.code,
      details: error.details,
      message: error.message,
    });
    redirect("/?section=files&setup=file-move-error");
  }

  try {
    const actor = await getActionActor(supabase);
    await writeSystemLog(admin, actor.id, "file_moved", [
      `file=${fileId}`,
      `from=${file.category_id ?? "-"}:${file.folder_id ?? "-"}`,
      `to=${target.categoryId}:${target.folderId ?? "-"}`,
      reason ? `reason=${reason}` : null,
    ]);
  } catch (error) {
    console.error("file move system log failed", {
      message: error instanceof Error ? error.message : String(error),
    });
  }

  try {
    await moveDriveFileForRecord(fileId);
  } catch (driveError) {
    console.error("drive file move failed", {
      message:
        driveError instanceof Error ? driveError.message : String(driveError),
    });
  }

  revalidatePath("/", "layout");
  redirect("/?section=files&setup=file-moved");
}

export async function deleteFileAction(formData: FormData) {
  if (!hasSupabasePublicEnv() || !hasSupabaseServerEnv()) {
    redirect("/?section=files&setup=missing-supabase");
  }

  const fileId = getFormText(formData, "fileId");
  const reason = getFormText(formData, "reason");

  if (!isUuidText(fileId)) {
    redirect("/?section=files&setup=file-delete-missing");
  }

  if (reason.length < 8) {
    redirect("/?section=files&setup=file-delete-reason");
  }

  const supabase = await createSupabaseServerClient();

  if (!(await hasMfaLevel2(supabase))) {
    redirect("/?section=files&setup=file-delete-aal2");
  }

  const { data: canViewFiles } = await supabase.rpc("has_permission", {
    required_key: "files.view",
  });
  const { data: canDeleteFiles } = await supabase.rpc("has_permission", {
    required_key: "files.delete",
  });

  if (canViewFiles !== true || canDeleteFiles !== true) {
    redirect("/?section=files&setup=file-delete-permission");
  }

  const admin = getSupabaseAdminClient();
  const file = await getFileActionRow(admin, fileId);

  if (!file?.storage_path && !file?.external_url) {
    redirect("/?section=files&setup=file-delete-missing");
  }

  if (!(await hasFolderActionPermission(supabase, file.folder_id, "delete"))) {
    redirect("/?section=files&setup=file-delete-permission");
  }

  const { error } = await supabase.rpc("soft_delete_file_record", {
    p_file_id: fileId,
    p_reason: reason,
  });

  if (error) {
    console.error("soft delete file failed", {
      code: error.code,
      details: error.details,
      message: error.message,
    });
    redirect("/?section=files&setup=file-delete-error");
  }

  try {
    const actor = await getActionActor(supabase);
    await writeSystemLog(admin, actor.id, "file_soft_deleted", [
      `file=${fileId}`,
      `name=${file.original_filename ?? "-"}`,
      `reason=${reason}`,
    ]);
  } catch (error) {
    console.error("file delete system log failed", {
      message: error instanceof Error ? error.message : String(error),
    });
  }

  revalidatePath("/", "layout");
  redirect("/?section=files&setup=file-deleted");
}

function getFormText(formData: FormData, key: string) {
  return String(formData.get(key) ?? "").trim();
}

function getFormBool(formData: FormData, key: string) {
  return formData.get(key) === "on";
}

function getFormTags(formData: FormData, key: string) {
  return getFormText(formData, key)
    .split(",")
    .map((tag) => tag.trim())
    .filter(Boolean)
    .slice(0, 12);
}

function getFormList(formData: FormData, key: string) {
  return formData
    .getAll(key)
    .map((value) => String(value ?? "").trim())
    .filter(Boolean);
}

async function requireTemporaryDesignManager(supabase: SupabaseServerClient) {
  if (!(await hasMfaLevel2(supabase))) {
    redirect("/?section=settings&setup=temporary-design-aal2");
  }

  const canManageDesigns =
    (await hasPermission(supabase, "design.manage")) ||
    (await hasPermission(supabase, "roles.manage")) ||
    (await hasPermission(supabase, "users.manage"));

  if (!canManageDesigns) {
    redirect("/?section=settings&setup=temporary-design-denied");
  }

  return getActionActor(supabase);
}

function getOptionalDateText(formData: FormData, key: string) {
  const value = getFormText(formData, key);

  return /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : "";
}

function getFlexibleDateText(formData: FormData, key: string) {
  const value = getFormText(formData, key);

  if (/^\d{4}-\d{2}-\d{2}$/.test(value) || /^\d{2}-\d{2}$/.test(value)) {
    return value;
  }

  return "";
}

function getColorText(formData: FormData, key: string, fallback: string) {
  const value = getFormText(formData, key);

  return /^#[0-9a-f]{6}$/i.test(value) ? value : fallback;
}

function getThemeClassText(formData: FormData, key: string) {
  const value = getFormText(formData, key);

  return /^theme-[a-z0-9-]{2,80}$/.test(value) ? value : "";
}

function getSafeTokenText(formData: FormData, key: string) {
  return getFormText(formData, key)
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
}

function getAllowedDynamicDate(value: string) {
  return ["", "black_friday", "christi_himmelfahrt", "easter_sunday", "pfingsten"].includes(value)
    ? value
    : "";
}

function getTemporaryDesignErrorRedirect(message?: string) {
  const normalized = String(message ?? "").toLowerCase();

  if (
    normalized.includes("temporary_design_settings") ||
    normalized.includes("temporary_design_templates") ||
    normalized.includes("schema cache") ||
    normalized.includes("does not exist")
  ) {
    return "/?section=settings&setup=temporary-design-migration";
  }

  return "/?section=settings&setup=temporary-design-error";
}

async function getModerationAdviceActionContext(errorSetup: string) {
  if (!hasSupabasePublicEnv() || !hasSupabaseServerEnv()) {
    redirect("/?section=advice&setup=missing-supabase");
  }

  const supabase = await createSupabaseServerClient();

  if (!(await hasMfaLevel2(supabase))) {
    redirect("/?section=advice&setup=advice-aal2");
  }

  if (!(await hasPermission(supabase, "moderation.manage"))) {
    redirect("/?section=advice&setup=advice-denied");
  }

  try {
    const actor = await getActionActor(supabase);

    return {
      actor,
      admin: getSupabaseAdminClient(),
      supabase,
    };
  } catch (error) {
    console.error("moderation advice actor lookup failed", {
      message: error instanceof Error ? error.message : String(error),
    });
    redirect(`/?section=advice&setup=${errorSetup}`);
  }
}

function getAdviceUploadFiles(formData: FormData) {
  return [
    ...formData.getAll("screenshots"),
    ...formData.getAll("screenshot"),
    ...formData.getAll("evidenceFiles"),
    ...formData.getAll("evidenceFile"),
  ].filter((value): value is File => value instanceof File && value.size > 0);
}

function areAdviceUploadTypesAllowed(files: File[]) {
  return files.every((file) =>
    isAdviceUploadTypeAllowed({
      contentType: file.type,
      fileName: file.name,
    }),
  );
}

function isAdviceUploadTypeAllowed(input: { contentType: string; fileName: string }) {
  const contentType = input.contentType.toLowerCase();
  const extension = getFileExtension(input.fileName);

  if (
    contentType &&
    (ADVICE_FILE_CONTENT_TYPES.has(contentType) || contentType.startsWith("image/"))
  ) {
    return true;
  }

  return ADVICE_FILE_EXTENSIONS.has(extension);
}

function getUploadedAdviceEvidence(formData: FormData) {
  const rawValue = getFormText(formData, "uploadedEvidenceJson");

  if (!rawValue) {
    return [] as UploadedAdviceEvidence[];
  }

  let parsed: unknown;

  try {
    parsed = JSON.parse(rawValue);
  } catch {
    return null;
  }

  if (!Array.isArray(parsed)) {
    return null;
  }

  const uploadedEvidence: UploadedAdviceEvidence[] = [];

  for (const item of parsed.slice(0, MAX_ADVICE_UPLOADS + 1)) {
    if (!isObjectRecord(item)) {
      return null;
    }

    const originalName = sanitizeFileName(asActionText(item.originalName) || "beleg.bin");
    const contentType =
      asActionText(item.contentType) || "application/octet-stream";
    const evidenceType =
      asActionText(item.evidenceType) === "screenshot" ? "screenshot" : "file";
    const storagePath = asActionText(item.storagePath);
    const size = Number(item.size);

    if (
      !storagePath ||
      !storagePath.startsWith(`${ADVICE_STAGING_PREFIX}/`) ||
      !Number.isFinite(size) ||
      size <= 0
    ) {
      return null;
    }

    uploadedEvidence.push({
      contentType,
      evidenceType,
      extractedText: sanitizeUploadedEvidenceText(
        asActionText(item.extractedText) ?? "",
        contentType,
        originalName,
      ),
      originalName,
      size,
      storagePath,
    });
  }

  return uploadedEvidence;
}

function areUploadedAdviceEvidenceAllowed(evidenceItems: UploadedAdviceEvidence[]) {
  return evidenceItems.every((evidence) => {
    if (evidence.evidenceType !== "file" && evidence.evidenceType !== "screenshot") {
      return false;
    }

    return isAdviceUploadTypeAllowed({
      contentType: evidence.contentType,
      fileName: evidence.originalName,
    });
  });
}

async function insertModerationAdviceEvidence(input: {
  actorId: string;
  admin: SupabaseAdminClient;
  caseId: string;
  files: File[];
  formData: FormData;
  uploadedEvidence: UploadedAdviceEvidence[];
}) {
  const messageLinks = getFormText(input.formData, "messageLinks")
    .split(/[\s,]+/)
    .map((link) => link.trim())
    .filter(Boolean)
    .filter(isHttpUrl)
    .slice(0, 20);
  const evidenceNotes = getFormText(input.formData, "evidenceNotes");

  for (const link of messageLinks) {
    const { error } = await input.admin.from("moderation_advice_evidence").insert({
      advice_case_id: input.caseId,
      evidence_type: "message_link",
      external_url: link,
      label: "Discord Message-Link",
      metadata: { source: "form" },
      uploaded_by: input.actorId,
    });

    if (error) {
      throw new Error(`message link evidence failed: ${error.message}`);
    }

    await writeModerationAdviceLog(input.admin, {
      action: "beleg_hinzugefuegt",
      actorId: input.actorId,
      caseId: input.caseId,
      details: { evidenceType: "message_link", link },
    });
  }

  if (evidenceNotes) {
    const { error } = await input.admin.from("moderation_advice_evidence").insert({
      advice_case_id: input.caseId,
      description: evidenceNotes,
      evidence_type: "note",
      label: "Belegnotiz",
      metadata: { note: evidenceNotes, source: "form" },
      uploaded_by: input.actorId,
    });

    if (error) {
      throw new Error(`note evidence failed: ${error.message}`);
    }

    await writeModerationAdviceLog(input.admin, {
      action: "beleg_hinzugefuegt",
      actorId: input.actorId,
      caseId: input.caseId,
      details: { evidenceType: "note" },
    });
  }

  for (const file of input.files) {
    await uploadModerationAdviceEvidenceFile(input.admin, {
      actorId: input.actorId,
      caseId: input.caseId,
      file,
    });
  }

  for (const evidence of input.uploadedEvidence) {
    await insertPreparedModerationAdviceEvidenceFile(input.admin, {
      actorId: input.actorId,
      caseId: input.caseId,
      evidence,
    });
  }
}

async function uploadModerationAdviceEvidenceFile(
  admin: SupabaseAdminClient,
  input: { actorId: string; caseId: string; file: File },
) {
  const originalName = sanitizeFileName(input.file.name || "beleg.bin");
  const contentType = input.file.type || "application/octet-stream";
  const storagePath = `moderation-advice/${input.caseId}/${crypto.randomUUID()}-${originalName}`;
  const fileBody = new Uint8Array(await input.file.arrayBuffer());
  const extractedText = extractSafeEvidenceText(input.file, fileBody);
  const { error: uploadError } = await admin.storage
    .from(FILE_BUCKET)
    .upload(storagePath, fileBody, {
      contentType,
      upsert: false,
    });

  if (uploadError) {
    throw new Error(`advice evidence storage failed: ${uploadError.message}`);
  }

  const evidenceType = contentType.toLowerCase().startsWith("image/")
    ? "screenshot"
    : "file";
  const { error } = await admin.from("moderation_advice_evidence").insert({
    advice_case_id: input.caseId,
    evidence_type: evidenceType,
    label: originalName,
    metadata: {
      contentType,
      extractedText,
      originalName,
      size: input.file.size,
      storagePath,
    },
    uploaded_by: input.actorId,
  });

  if (error) {
    await admin.storage.from(FILE_BUCKET).remove([storagePath]);
    throw new Error(`advice evidence write failed: ${error.message}`);
  }

  await writeModerationAdviceLog(admin, {
    action: "beleg_hinzugefuegt",
    actorId: input.actorId,
    caseId: input.caseId,
    details: {
      contentType,
      evidenceType,
      originalName,
      size: input.file.size,
    },
  });
}

async function insertPreparedModerationAdviceEvidenceFile(
  admin: SupabaseAdminClient,
  input: { actorId: string; caseId: string; evidence: UploadedAdviceEvidence },
) {
  const stagingPrefix = `${ADVICE_STAGING_PREFIX}/${input.actorId}/`;

  if (!input.evidence.storagePath.startsWith(stagingPrefix)) {
    throw new Error("advice evidence staging path denied");
  }

  const originalName = sanitizeFileName(input.evidence.originalName || "beleg.bin");
  const finalStoragePath = `moderation-advice/${input.caseId}/${crypto.randomUUID()}-${originalName}`;
  const { error: moveError } = await admin.storage
    .from(FILE_BUCKET)
    .move(input.evidence.storagePath, finalStoragePath);

  if (moveError) {
    throw new Error(`advice evidence storage move failed: ${moveError.message}`);
  }

  const evidenceType =
    input.evidence.evidenceType === "screenshot" ||
    input.evidence.contentType.toLowerCase().startsWith("image/")
      ? "screenshot"
      : "file";
  const { error } = await admin.from("moderation_advice_evidence").insert({
    advice_case_id: input.caseId,
    evidence_type: evidenceType,
    label: originalName,
    metadata: {
      contentType: input.evidence.contentType,
      extractedText: input.evidence.extractedText,
      originalName,
      size: input.evidence.size,
      storagePath: finalStoragePath,
      uploadMode: "direct_to_supabase",
    },
    uploaded_by: input.actorId,
  });

  if (error) {
    await admin.storage.from(FILE_BUCKET).remove([finalStoragePath]);
    throw new Error(`advice evidence write failed: ${error.message}`);
  }

  await writeModerationAdviceLog(admin, {
    action: "beleg_hinzugefuegt",
    actorId: input.actorId,
    caseId: input.caseId,
    details: {
      contentType: input.evidence.contentType,
      evidenceType,
      originalName,
      size: input.evidence.size,
      uploadMode: "direct_to_supabase",
    },
  });
}

function extractSafeEvidenceText(file: File, body: Uint8Array) {
  if (!isTextLikeAdviceEvidence(file.type, file.name) || body.byteLength > 200 * 1024) {
    return "";
  }

  return new TextDecoder("utf-8", { fatal: false })
    .decode(body)
    .replace(/\u0000/g, "")
    .slice(0, 12_000);
}

function sanitizeUploadedEvidenceText(
  value: string,
  contentType: string,
  fileName: string,
) {
  if (!value || !isTextLikeAdviceEvidence(contentType, fileName)) {
    return "";
  }

  return value.replace(/\u0000/g, "").slice(0, 12_000);
}

function isTextLikeAdviceEvidence(contentType: string, fileName: string) {
  const normalizedContentType = contentType.toLowerCase();
  const extension = getFileExtension(fileName);

  return (
    ADVICE_TEXT_CONTENT_TYPES.has(normalizedContentType) ||
    [".csv", ".htm", ".html", ".json", ".md", ".tsv", ".txt", ".xml", ".yaml", ".yml"].includes(extension)
  );
}

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

async function getAdviceTargetMember(
  admin: SupabaseAdminClient,
  memberId: string,
) {
  const { data, error } = await admin
    .from("members")
    .select("id,name,discord_id,discord_username,discord_display_name")
    .eq("id", memberId)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return data ? asActionObject(data) : null;
}

function isHttpUrl(value: string) {
  try {
    const url = new URL(value);

    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

function sanitizeFileName(value: string) {
  const sanitized = value
    .normalize("NFKD")
    .replace(/[^\w.\-]+/g, "_")
    .replace(/_+/g, "_")
    .slice(0, 120);

  return sanitized || "beleg.bin";
}

function getFileExtension(value: string) {
  const match = value.toLowerCase().match(/\.[a-z0-9]+$/);

  return match?.[0] ?? "";
}

type SupabaseServerClient = Awaited<ReturnType<typeof createSupabaseServerClient>>;
type SupabaseAdminClient = ReturnType<typeof getSupabaseAdminClient>;

type ActionErrorLike = {
  code?: string;
  message?: string;
};

async function hasMfaLevel2(supabase: SupabaseServerClient) {
  const { data } = await supabase.rpc("has_mfa_level2");

  return data === true;
}

async function getActionActor(supabase: SupabaseServerClient) {
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    throw new Error("user not found");
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("display_name,username,email")
    .eq("id", user.id)
    .maybeSingle();

  return {
    id: user.id,
    name: String(
      profile?.display_name ?? profile?.username ?? profile?.email ?? user.email ?? user.id,
    ),
  };
}

async function hasPermission(supabase: SupabaseServerClient, permissionKey: string) {
  const { data } = await supabase.rpc("has_permission", {
    required_key: permissionKey,
  });

  return data === true;
}

type AbsenceMinistryRole = {
  discordRoleId: string;
  id: string;
  name: string;
};

async function getAbsenceMember(admin: SupabaseAdminClient, memberId: string) {
  const { data, error } = await admin
    .from("members")
    .select(
      `
        id,
        name,
        discord_id,
        discord_username,
        discord_display_name,
        discord_on_server,
        member_discord_roles(discord_roles(discord_role_id, role_name))
      `,
    )
    .eq("id", memberId)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return data ? asActionObject(data) : null;
}

async function getActiveAbsenceForMember(
  admin: SupabaseAdminClient,
  memberId: string,
) {
  const { data, error } = await admin
    .from("member_absences")
    .select("id")
    .eq("member_id", memberId)
    .in("status", ["active", "ending"])
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return Boolean(data?.id);
}

async function getMemberMinistryRoles(
  admin: SupabaseAdminClient,
  member: Record<string, unknown>,
): Promise<AbsenceMinistryRole[]> {
  const roleIds = getSyncedDiscordRoleIds(member);

  if (roleIds.length === 0) {
    return [];
  }

  const { data, error } = await admin
    .from("representation_ministry_roles")
    .select("id,discord_role_id,name")
    .eq("active", true)
    .in("discord_role_id", roleIds)
    .order("sort_order", { ascending: true })
    .order("name", { ascending: true });

  if (error) {
    throw new Error(error.message);
  }

  return (data ?? [])
    .map((row) => ({
      discordRoleId: String(row.discord_role_id ?? ""),
      id: String(row.id ?? ""),
      name: String(row.name ?? row.discord_role_id ?? "Amtsrolle"),
    }))
    .filter((role) => role.id && role.discordRoleId);
}

async function buildAbsenceRepresentations(
  admin: SupabaseAdminClient,
  input: {
    absenceId: string;
    discordUserId: string;
    memberId: string;
    ministryRoles: AbsenceMinistryRole[];
  },
) {
  if (input.ministryRoles.length === 0) {
    return [];
  }

  const [eligibilitiesResult, absencesResult, busyRepresentationsResult] =
    await Promise.all([
      admin
        .from("representation_eligibilities")
        .select(
          `
            id,
            representative_member_id,
            representative_discord_id,
            active,
            priority,
            members(id, name, discord_id, discord_on_server),
            representation_eligibility_ministry_roles(ministry_role_id)
          `,
        )
        .eq("active", true)
        .order("priority", { ascending: true })
        .order("created_at", { ascending: true }),
      admin
        .from("member_absences")
        .select("member_id")
        .in("status", ["active", "ending"]),
      admin
        .from("member_absence_representations")
        .select("representative_member_id,representative_discord_id")
        .in("status", ["pending", "assigning", "active", "ending"]),
    ]);

  if (eligibilitiesResult.error) {
    throw new Error(eligibilitiesResult.error.message);
  }

  if (absencesResult.error) {
    throw new Error(absencesResult.error.message);
  }

  if (busyRepresentationsResult.error) {
    throw new Error(busyRepresentationsResult.error.message);
  }

  const absentMemberIds = new Set(
    (absencesResult.data ?? [])
      .map((row) => String(row.member_id ?? ""))
      .filter(Boolean),
  );
  const busyMemberIds = new Set(
    (busyRepresentationsResult.data ?? [])
      .map((row) => String(row.representative_member_id ?? ""))
      .filter(Boolean),
  );
  const busyDiscordIds = new Set(
    (busyRepresentationsResult.data ?? [])
      .map((row) => String(row.representative_discord_id ?? ""))
      .filter(Boolean),
  );
  const assignedThisRun = new Set<string>();
  const eligibilities = (eligibilitiesResult.data ?? []).map(asActionObject);

  return input.ministryRoles.map((ministryRole) => {
    const candidate = eligibilities.find((eligibility) => {
      const allowedRoleIds = asActionArray(
        eligibility.representation_eligibility_ministry_roles,
      ).map((entry) => String(asActionObject(entry).ministry_role_id ?? ""));
      const representative = asActionObject(eligibility.members);
      const representativeMemberId = String(
        eligibility.representative_member_id ?? representative.id ?? "",
      );
      const representativeDiscordId =
        asActionText(representative.discord_id) ??
        asActionText(eligibility.representative_discord_id) ??
        "";

      return (
        allowedRoleIds.includes(ministryRole.id) &&
        representativeMemberId &&
        representativeMemberId !== input.memberId &&
        representativeDiscordId &&
        representativeDiscordId !== input.discordUserId &&
        representative.discord_on_server === true &&
        !absentMemberIds.has(representativeMemberId) &&
        !busyMemberIds.has(representativeMemberId) &&
        !busyDiscordIds.has(representativeDiscordId) &&
        !assignedThisRun.has(representativeMemberId)
      );
    });

    if (!candidate) {
      return {
        absence_id: input.absenceId,
        bot_error: "Keine aktive Vertretung fuer diese Amtsrolle frei.",
        discord_role_id: ministryRole.discordRoleId,
        ministry_role_id: ministryRole.id,
        ministry_role_name: ministryRole.name,
        represented_discord_id: input.discordUserId,
        represented_member_id: input.memberId,
        status: "failed",
      };
    }

    const representative = asActionObject(candidate.members);
    const representativeMemberId = String(
      candidate.representative_member_id ?? representative.id ?? "",
    );
    const representativeDiscordId =
      asActionText(representative.discord_id) ??
      asActionText(candidate.representative_discord_id) ??
      "";

    assignedThisRun.add(representativeMemberId);

    return {
      absence_id: input.absenceId,
      discord_role_id: ministryRole.discordRoleId,
      ministry_role_id: ministryRole.id,
      ministry_role_name: ministryRole.name,
      represented_discord_id: input.discordUserId,
      represented_member_id: input.memberId,
      representative_discord_id: representativeDiscordId,
      representative_member_id: representativeMemberId,
      status: "pending",
    };
  });
}

function getSyncedDiscordRoleIds(member: Record<string, unknown>) {
  return [
    ...new Set(
      asActionArray(member.member_discord_roles)
        .map((entry) =>
          String(
            asActionObject(asActionObject(entry).discord_roles).discord_role_id ?? "",
          ),
        )
        .filter(isDiscordSnowflake),
    ),
  ];
}

type FileActionRow = {
  category_id: string | null;
  folder_id: string | null;
  id: string;
  original_filename: string | null;
  external_url: string | null;
  storage_path: string | null;
};

async function getFileActionRow(admin: SupabaseAdminClient, fileId: string) {
  const { data, error } = await admin
    .from("files")
    .select("id,category_id,folder_id,original_filename,storage_path,external_url")
    .eq("id", fileId)
    .maybeSingle();

  if (error) {
    console.error("file action lookup failed", {
      code: error.code,
      details: error.details,
      message: error.message,
    });
    return null;
  }

  return data as FileActionRow | null;
}

async function hasFolderActionPermission(
  supabase: SupabaseServerClient,
  folderId: string | null,
  permission: "delete" | "edit" | "open" | "upload",
) {
  if (!folderId) {
    return true;
  }

  const { data } = await supabase.rpc("has_folder_permission", {
    p_folder_id: folderId,
    p_permission: permission,
  });

  return data === true;
}

async function resolveFileMoveTarget(
  admin: SupabaseAdminClient,
  folderId: string | null,
  categoryId: string,
) {
  if (folderId) {
    const { data, error } = await admin
      .from("folders")
      .select("id,category_id")
      .eq("id", folderId)
      .maybeSingle();

    if (error || !data?.id || !data.category_id) {
      if (error) {
        console.error("file move folder lookup failed", {
          code: error.code,
          details: error.details,
          message: error.message,
        });
      }

      return null;
    }

    return {
      categoryId: String(data.category_id),
      folderId: String(data.id),
    };
  }

  const { data, error } = await admin
    .from("file_categories")
    .select("id")
    .eq("id", categoryId)
    .eq("active", true)
    .maybeSingle();

  if (error || !data?.id) {
    if (error) {
      console.error("file move category lookup failed", {
        code: error.code,
        details: error.details,
        message: error.message,
      });
    }

    return null;
  }

  return {
    categoryId: String(data.id),
    folderId: null,
  };
}

async function writeSystemLog(
  admin: SupabaseAdminClient,
  actorId: string,
  action: string,
  details: Array<string | null>,
) {
  const { error } = await admin.from("systemprotokoll").insert({
    aktion: action,
    bereich: "files",
    benutzer_id: actorId,
    details: details.filter(Boolean).join("; "),
  });

  if (error) {
    throw new Error(error.message);
  }
}

async function getModerationEventForMember(
  admin: SupabaseAdminClient,
  eventId: string,
  memberId: string,
) {
  const { data: member, error: memberError } = await admin
    .from("members")
    .select("id,discord_id")
    .eq("id", memberId)
    .maybeSingle();

  if (memberError || !member?.id) {
    if (memberError) {
      console.error("moderation member lookup failed", {
        code: memberError.code,
        details: memberError.details,
        message: memberError.message,
      });
    }

    return null;
  }

  const { data: event, error: eventError } = await admin
    .from("discord_moderation_events")
    .select("id,member_id,discord_user_id,metadata")
    .eq("id", eventId)
    .maybeSingle();

  if (eventError || !event?.id) {
    if (eventError) {
      console.error("moderation event lookup failed", {
        code: eventError.code,
        details: eventError.details,
        message: eventError.message,
      });
    }

    return null;
  }

  const eventMemberId = String(event.member_id ?? "");
  const eventDiscordId = String(event.discord_user_id ?? "");
  const memberDiscordId = String(member.discord_id ?? "");

  if (eventMemberId === memberId || (memberDiscordId && eventDiscordId === memberDiscordId)) {
    return event;
  }

  return null;
}

function getRecordMetadata(value: unknown): Record<string, unknown> {
  if (typeof value === "object" && value !== null && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }

  return {};
}

async function writeMemberCaseAuditLog(input: {
  fieldName: string;
  memberId: string;
  newValue?: string;
  oldValue?: string;
  reason: string;
  supabase: SupabaseServerClient;
}) {
  try {
    const admin = getSupabaseAdminClient();
    const actor = await getActionActor(input.supabase);
    const { error } = await admin.from("member_case_logs").insert({
      action: "edit",
      field_name: input.fieldName,
      member_id: input.memberId,
      new_value: input.newValue ?? null,
      old_value: input.oldValue ?? null,
      reason: input.reason,
      success: true,
      user_id: actor.id,
      username: actor.name,
    });

    if (error) {
      console.error("member moderation audit log failed", {
        code: error.code,
        details: error.details,
        message: error.message,
      });
    }
  } catch (error) {
    console.error("member moderation audit log failed", {
      message: error instanceof Error ? error.message : String(error),
    });
  }
}

async function setMemberFileLinkWithAudit(input: {
  fileId: string;
  link: boolean;
  memberId: string;
  reason: string;
  relationType: string;
  supabase: SupabaseServerClient;
}) {
  const admin = getSupabaseAdminClient();
  const actor = await getActionActor(input.supabase);
  const { data: member, error: memberError } = await admin
    .from("members")
    .select("id,name")
    .eq("id", input.memberId)
    .maybeSingle();

  if (memberError) {
    throw new Error(memberError.message);
  }

  if (!member?.id) {
    throw new Error("member not found");
  }

  const { data: file, error: fileError } = await admin
    .from("files")
    .select("id")
    .eq("id", input.fileId)
    .maybeSingle();

  if (fileError) {
    throw new Error(fileError.message);
  }

  if (!file?.id) {
    throw new Error("file not found");
  }

  if (input.link) {
    if (input.relationType === "avatar") {
      const { error: oldAvatarError } = await admin
        .from("member_files")
        .delete()
        .eq("member_id", input.memberId)
        .eq("relation_type", "avatar")
        .neq("file_id", input.fileId);

      if (oldAvatarError) {
        throw new Error(oldAvatarError.message);
      }
    }

    const { error } = await admin.from("member_files").upsert(
      {
        created_by: actor.id,
        file_id: input.fileId,
        member_id: input.memberId,
        relation_type: input.relationType,
      },
      { onConflict: "member_id,file_id" },
    );

    if (error) {
      throw new Error(error.message);
    }

    if (input.relationType === "avatar") {
      const { error: avatarError } = await admin
        .from("members")
        .update({
          image_file_id: input.fileId,
          updated_at: new Date().toISOString(),
        })
        .eq("id", input.memberId);

      if (avatarError) {
        throw new Error(avatarError.message);
      }
    }
  } else {
    const { data, error } = await admin
      .from("member_files")
      .delete()
      .eq("member_id", input.memberId)
      .eq("file_id", input.fileId)
      .select("member_id");

    if (error) {
      throw new Error(error.message);
    }

    if (!data || data.length === 0) {
      throw new Error("link not found");
    }

    const { data: currentMember, error: currentMemberError } = await admin
      .from("members")
      .select("image_file_id")
      .eq("id", input.memberId)
      .maybeSingle();

    if (currentMemberError) {
      throw new Error(currentMemberError.message);
    }

    if (String(currentMember?.image_file_id ?? "") === input.fileId) {
      const { error: avatarError } = await admin
        .from("members")
        .update({
          image_file_id: null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", input.memberId);

      if (avatarError) {
        throw new Error(avatarError.message);
      }
    }
  }

  const { error: logError } = await admin.from("member_case_logs").insert({
    action: input.link ? "link_file" : "unlink_file",
    member_id: input.memberId,
    reason: input.reason,
    related_file_id: input.fileId,
    success: true,
    user_id: actor.id,
    username: actor.name,
  });

  if (logError) {
    console.error("member file audit log failed", {
      code: logError.code,
      details: logError.details,
      message: logError.message,
    });
  }
}

async function ensureProfileImageCategory() {
  const admin = getSupabaseAdminClient();
  const { data: existing, error: lookupError } = await admin
    .from("file_categories")
    .select("id")
    .eq("name", PROFILE_IMAGE_CATEGORY_NAME)
    .maybeSingle();

  if (lookupError) {
    throw new Error(lookupError.message);
  }

  if (existing?.id) {
    return String(existing.id);
  }

  const { data, error } = await admin
    .from("file_categories")
    .insert({
      active: true,
      description: "Profilbilder fuer Mitgliederakten.",
      name: PROFILE_IMAGE_CATEGORY_NAME,
      sort_order: 15,
    })
    .select("id")
    .single();

  if (error || !data?.id) {
    throw new Error(error?.message ?? "profile image category failed");
  }

  return String(data.id);
}

function getMemberFileRelationType(formData: FormData) {
  const value = getFormText(formData, "relationType");

  if (["avatar", "evidence", "linked", "note"].includes(value)) {
    return value;
  }

  return "linked";
}

function getOptionalFormNumber(formData: FormData, key: string) {
  const value = getFormText(formData, key);

  if (!value) {
    return null;
  }

  const parsed = Number(value);

  return Number.isFinite(parsed) ? parsed : null;
}

function clampInteger(
  value: number | null,
  min: number,
  max: number,
  fallback: number,
) {
  if (!Number.isFinite(value)) {
    return fallback;
  }

  return Math.min(max, Math.max(min, Math.trunc(Number(value))));
}

function getOptionalIsoDate(formData: FormData, key: string) {
  const value = getFormText(formData, key);

  if (!value) {
    return null;
  }

  const date = new Date(value);

  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function isMemberStatus(value: string): value is "active" | "archived" | "review" {
  return value === "active" || value === "archived" || value === "review";
}

function isModerationAction(
  value: string,
): value is "ban" | "kick" | "timeout" | "voice_disconnect" | "warn" {
  return (
    value === "ban" ||
    value === "kick" ||
    value === "timeout" ||
    value === "voice_disconnect" ||
    value === "warn"
  );
}

function isDiscordSnowflake(value: string) {
  return /^[0-9]{15,25}$/.test(value);
}

function isUuidText(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value,
  );
}

function asActionObject(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function asActionArray(value: unknown) {
  return Array.isArray(value) ? value : [];
}

function asActionText(value: unknown) {
  const text = String(value ?? "").trim();

  return text || null;
}

function isRedirectError(error: unknown) {
  const record = asActionObject(error);
  const digest = String(record.digest ?? "");

  return (
    digest.startsWith("NEXT_REDIRECT") ||
    (error instanceof Error && error.message === "NEXT_REDIRECT")
  );
}

function isModerationStatus(value: string) {
  return (
    value === "active" ||
    value === "expired" ||
    value === "failed" ||
    value === "lifted" ||
    value === "recorded"
  );
}

function isLiveCommandStatus(value: unknown) {
  return value === "pending" || value === "running";
}

function buildStoragePath(userId: string, originalName: string) {
  const safeName =
    originalName
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9._-]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .replace(/\.{2,}/g, ".")
      .slice(0, 96) || "upload.bin";

  return `${userId}/${Date.now()}-${crypto.randomUUID()}-${safeName}`;
}

function getUploadPathParts(file: File) {
  const relativePath = String(
    (file as File & { webkitRelativePath?: string }).webkitRelativePath ||
      file.name ||
      "upload.bin",
  );
  const rawParts = relativePath
    .split(/[\\/]+/)
    .map((part) => part.trim())
    .filter((part) => part && part !== "." && part !== "..");
  const parts =
    rawParts[0]?.toLowerCase() === "c:" &&
    rawParts[1]?.toLowerCase() === "fakepath"
      ? rawParts.slice(2)
      : rawParts;
  const safeParts = parts.map(sanitizeUploadPathPart).filter(Boolean);

  return safeParts.length > 0 ? safeParts : [sanitizeUploadPathPart(file.name) || "upload.bin"];
}

function sanitizeUploadPathPart(value: string) {
  return (
    value
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[<>:"|?*\u0000-\u001f]+/g, "-")
      .replace(/\s+/g, " ")
      .replace(/^-+|-+$/g, "")
      .trim()
      .slice(0, 120) || ""
  );
}

async function ensureNestedUploadFolder({
  admin,
  baseFolderId,
  cache,
  categoryId,
  folderNames,
  supabase,
}: {
  admin: SupabaseAdminClient;
  baseFolderId: string | null;
  cache: Map<string, string | null>;
  categoryId: string;
  folderNames: string[];
  supabase: SupabaseServerClient;
}) {
  let parentFolderId = baseFolderId;

  for (const folderName of folderNames) {
    const cacheKey = [
      categoryId,
      parentFolderId ?? "root",
      folderName.toLowerCase(),
    ].join(":");

    if (cache.has(cacheKey)) {
      parentFolderId = cache.get(cacheKey) ?? null;
      continue;
    }

    const existing = await findUploadFolder(admin, {
      categoryId,
      name: folderName,
      parentFolderId,
    });

    if (existing) {
      parentFolderId = existing;
      cache.set(cacheKey, parentFolderId);
      continue;
    }

    const { data: createdFolderId, error } = await supabase.rpc(
      "create_folder_record",
      {
        p_category_id: categoryId,
        p_name: folderName,
        p_parent_folder_id: parentFolderId,
      },
    );

    if (error || !isUuidText(String(createdFolderId ?? ""))) {
      const retryExisting = await findUploadFolder(admin, {
        categoryId,
        name: folderName,
        parentFolderId,
      });

      if (!retryExisting) {
        throw new Error(error?.message ?? "folder upload path failed");
      }

      parentFolderId = retryExisting;
      cache.set(cacheKey, parentFolderId);
      continue;
    }

    parentFolderId = String(createdFolderId);
    cache.set(cacheKey, parentFolderId);

    try {
      await ensureFolderRecordOnDrive(parentFolderId);
    } catch (driveError) {
      console.error("drive folder path sync failed", {
        message:
          driveError instanceof Error ? driveError.message : String(driveError),
      });
    }
  }

  return parentFolderId;
}

async function findUploadFolder(
  admin: SupabaseAdminClient,
  input: {
    categoryId: string;
    name: string;
    parentFolderId: string | null;
  },
) {
  let query = admin
    .from("folders")
    .select("id")
    .eq("category_id", input.categoryId)
    .eq("name", input.name)
    .is("deleted_at", null)
    .limit(1);

  query = input.parentFolderId
    ? query.eq("parent_folder_id", input.parentFolderId)
    : query.is("parent_folder_id", null);

  const { data, error } = await query.maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return data?.id ? String(data.id) : null;
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

function getMemberFileLinkErrorSetup(error: unknown) {
  const actionError = getActionError(error);
  const message = actionError.message?.toLowerCase() ?? "";

  if (message.includes("reason")) {
    return "member-file-reason";
  }

  if (message.includes("member") && message.includes("not found")) {
    return "member-file-missing";
  }

  if (message.includes("file") && message.includes("not found")) {
    return "member-file-file-missing";
  }

  if (message.includes("link not found")) {
    return "member-file-link-missing";
  }

  if (
    message.includes("access denied") ||
    message.includes("denied") ||
    message.includes("permission")
  ) {
    return "member-file-permission";
  }

  if (actionError.code === "23505" || message.includes("duplicate")) {
    return "member-file-duplicate";
  }

  return "member-file-error";
}

function getMemberProfileImageErrorSetup(error: unknown) {
  const message =
    error instanceof Error
      ? error.message.toLowerCase()
      : String(error).toLowerCase();

  if (message.includes("permission") || message.includes("denied")) {
    return "member-file-permission";
  }

  if (message.includes("member")) {
    return "member-avatar-missing";
  }

  if (message.includes("storage")) {
    return "member-avatar-storage";
  }

  return "member-avatar-error";
}

function getActionError(error: unknown): ActionErrorLike {
  if (error instanceof Error) {
    return { message: error.message };
  }

  if (typeof error === "object" && error !== null) {
    return error as ActionErrorLike;
  }

  return { message: String(error) };
}

function getMemberDiscordAnalyticsErrorSetup(error: { message?: string }) {
  const message = error.message?.toLowerCase() ?? "";

  if (message.includes("reason")) {
    return "member-analytics-reason";
  }

  if (message.includes("member") && message.includes("not found")) {
    return "member-analytics-missing";
  }

  if (
    message.includes("denied") ||
    message.includes("permission") ||
    message.includes("setting denied")
  ) {
    return "member-analytics-permission";
  }

  return "member-analytics-error";
}

function getMemberUpdateErrorSetup(error: { code?: string; message?: string }) {
  const message = error.message?.toLowerCase() ?? "";

  if (message.includes("reason")) {
    return "member-update-reason";
  }

  if (message.includes("name")) {
    return "member-update-name";
  }

  if (message.includes("age")) {
    return "member-update-age";
  }

  if (message.includes("not found")) {
    return "member-update-missing";
  }

  if (message.includes("denied") || message.includes("permission")) {
    return "member-update-permission";
  }

  if (error.code === "23505" || message.includes("duplicate")) {
    return "member-update-duplicate";
  }

  return "member-update-error";
}

function getMemberDeleteErrorSetup(error: { message?: string }) {
  const message = error.message?.toLowerCase() ?? "";

  if (message.includes("reason")) {
    return "member-delete-reason";
  }

  if (message.includes("not found")) {
    return "member-delete-missing";
  }

  if (message.includes("denied") || message.includes("permission")) {
    return "member-delete-permission";
  }

  return "member-delete-error";
}

function getDiscordInviteErrorSetup(error: { message?: string }) {
  const message = error.message?.toLowerCase() ?? "";

  if (message.includes("invitee") || message.includes("name")) {
    return "discord-invite-name";
  }

  if (message.includes("reason")) {
    return "discord-invite-reason";
  }

  if (message.includes("permission") && message.includes("not found")) {
    return "discord-invite-permission";
  }

  if (message.includes("permission")) {
    return "discord-invite-permission";
  }

  if (message.includes("target member")) {
    return "discord-invite-member";
  }

  if (message.includes("denied")) {
    return "discord-invite-denied";
  }

  return "discord-invite-error";
}

function getUserRoleErrorSetup(error: { message?: string }) {
  const message = error.message?.toLowerCase() ?? "";

  if (
    message.includes("last administrator") ||
    message.includes("last root") ||
    message.includes("last root/admin")
  ) {
    return "role-assignment-last-admin";
  }

  if (message.includes("root owner")) {
    return "role-assignment-permission";
  }

  if (message.includes("not found")) {
    return "role-assignment-missing";
  }

  if (message.includes("denied")) {
    return "role-assignment-permission";
  }

  return "role-assignment-error";
}

function getTwoFactorRequirementErrorSetup(error: { message?: string }) {
  const message = error.message?.toLowerCase() ?? "";

  if (message.includes("not found")) {
    return "two-factor-requirement-missing";
  }

  if (message.includes("denied")) {
    return "two-factor-requirement-denied";
  }

  return "two-factor-requirement-error";
}

function getCategoryErrorSetup(error: { code?: string; message?: string }) {
  const message = error.message?.toLowerCase() ?? "";

  if (message.includes("name") || message.includes("required")) {
    return "category-name";
  }

  if (message.includes("denied") || message.includes("permission")) {
    return "category-permission";
  }

  if (error.code === "23505" || message.includes("duplicate")) {
    return "category-duplicate";
  }

  return "category-error";
}

function getRoleErrorSetup(error: { code?: string; message?: string }) {
  const message = error.message?.toLowerCase() ?? "";

  if (message.includes("name")) {
    return "role-name";
  }

  if (
    message.includes("administrator") ||
    message.includes("platform admin") ||
    message.includes("root owner")
  ) {
    return "role-admin-core";
  }

  if (message.includes("denied") || message.includes("permission")) {
    return "role-permission";
  }

  if (error.code === "23505" || message.includes("duplicate")) {
    return "role-duplicate";
  }

  return "role-error";
}

function getRolePermissionErrorSetup(error: { message?: string }) {
  const message = error.message?.toLowerCase() ?? "";

  if (
    message.includes("administrator") ||
    message.includes("platform admin") ||
    message.includes("root owner")
  ) {
    return "role-admin-core";
  }

  if (message.includes("not found")) {
    return "role-permission-missing";
  }

  if (message.includes("denied") || message.includes("permission")) {
    return "role-permission";
  }

  return "role-error";
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

function getOfficialAdviceDocumentType(
  formData: FormData,
): OfficialAdviceDocumentType {
  const value = getFormText(formData, "documentType");

  if (value === "sanktionsvorschlag" || value === "aktennotiz") {
    return value;
  }

  return "ermittlungsvermerk";
}

function getOfficialAdviceDocumentErrorSetup(error: unknown) {
  const message =
    error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();

  if (message.includes("needs_analysis")) {
    return "advice-document-needs-analysis";
  }

  if (message.includes("not_configured") || message.includes("disabled")) {
    return "advice-document-drive";
  }

  if (message.includes("template")) {
    return "advice-document-template";
  }

  if (message.includes("az") || message.includes("sequence") || message.includes("period")) {
    return "advice-document-az";
  }

  if (message.includes("folder")) {
    return "advice-document-folder";
  }

  if (message.includes("batch") || message.includes("document") || message.includes("docs")) {
    return "advice-document-fill";
  }

  return "advice-document-error";
}

function getGoogleDocErrorSetup(error: unknown) {
  const message =
    error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();

  if (message.includes("not_configured")) {
    return "google-doc-drive-config";
  }

  if (message.includes("name") || message.includes("document")) {
    return "google-doc-missing";
  }

  if (message.includes("conflict") || message.includes("duplicate")) {
    return "google-doc-duplicate";
  }

  if (message.includes("folder")) {
    return "google-doc-folder";
  }

  if (message.includes("denied") || message.includes("permission")) {
    return "google-doc-denied";
  }

  return "google-doc-error";
}

function getFileDownloadErrorSetup(error?: { code?: string; message?: string } | null) {
  const message = error?.message?.toLowerCase() ?? "";

  if (error?.code === "PGRST116" || message.includes("not found")) {
    return "file-download-missing";
  }

  if (
    message.includes("permission") ||
    message.includes("denied") ||
    message.includes("not authorized")
  ) {
    return "file-download-permission";
  }

  return "file-download-error";
}
