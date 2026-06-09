"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import {
  deleteDiscordInviteRequest,
  executeDiscordModerationAction,
} from "@/lib/discord-sync";
import { hasSupabasePublicEnv, hasSupabaseServerEnv } from "@/lib/env";
import {
  createSupabaseServerClient,
  getSupabaseAdminClient,
} from "@/lib/supabase/server";

const FILE_BUCKET = "schland-files";
const MAX_UPLOAD_BYTES = 50 * 1024 * 1024;

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

export async function uploadFileAction(formData: FormData) {
  if (!hasSupabasePublicEnv()) {
    redirect("/?section=files&setup=missing-supabase");
  }

  const file = formData.get("file");
  const categoryId = getFormText(formData, "categoryId");
  const folderId = getFormText(formData, "folderId") || null;

  if (!(file instanceof File) || !categoryId) {
    redirect("/?section=files&setup=file-upload-missing");
  }

  if (file.size <= 0 || file.size > MAX_UPLOAD_BYTES) {
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

  const originalName = file.name || "upload.bin";
  const fileType = file.type || "application/octet-stream";
  const storagePath = buildStoragePath(user.id, originalName);
  const fileBody = new Uint8Array(await file.arrayBuffer());

  const { error: uploadError } = await supabase.storage
    .from(FILE_BUCKET)
    .upload(storagePath, fileBody, {
      contentType: fileType,
      upsert: false,
    });

  if (uploadError) {
    console.error("storage upload failed", {
      message: uploadError.message,
    });
    redirect("/?section=files&setup=file-upload-storage");
  }

  const { error } = await supabase.rpc("register_uploaded_file", {
    p_category_id: categoryId,
    p_description: getFormText(formData, "description") || null,
    p_file_size: file.size,
    p_file_type: fileType,
    p_folder_id: folderId,
    p_original_filename: originalName,
    p_storage_path: storagePath,
    p_tags: getFormTags(formData, "tags"),
  });

  if (error) {
    await supabase.storage.from(FILE_BUCKET).remove([storagePath]);
    console.error("register_uploaded_file failed", {
      code: error.code,
      details: error.details,
      message: error.message,
    });
    redirect(`/?section=files&setup=${getFileUploadErrorSetup(error)}`);
  }

  revalidatePath("/", "layout");
  redirect("/?section=files&setup=file-uploaded");
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
    .select("storage_path")
    .eq("id", fileId)
    .single();

  if (fileError || !fileRow?.storage_path) {
    console.error("download file lookup failed", {
      code: fileError?.code,
      details: fileError?.details,
      message: fileError?.message,
    });
    redirect(`/?section=files&setup=${getFileDownloadErrorSetup(fileError)}`);
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

  if (!file?.storage_path) {
    redirect("/?section=files&setup=file-delete-missing");
  }

  if (!(await hasFolderActionPermission(supabase, file.folder_id, "delete"))) {
    redirect("/?section=files&setup=file-delete-permission");
  }

  const { error: removeError } = await admin.storage
    .from(FILE_BUCKET)
    .remove([file.storage_path]);

  if (removeError) {
    console.error("storage delete failed", {
      message: removeError.message,
    });
    redirect("/?section=files&setup=file-delete-storage");
  }

  const { error } = await admin.from("files").delete().eq("id", fileId);

  if (error) {
    console.error("delete file metadata failed", {
      code: error.code,
      details: error.details,
      message: error.message,
    });
    redirect("/?section=files&setup=file-delete-error");
  }

  try {
    const actor = await getActionActor(supabase);
    await writeSystemLog(admin, actor.id, "file_deleted", [
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

type FileActionRow = {
  category_id: string | null;
  folder_id: string | null;
  id: string;
  original_filename: string | null;
  storage_path: string | null;
};

async function getFileActionRow(admin: SupabaseAdminClient, fileId: string) {
  const { data, error } = await admin
    .from("files")
    .select("id,category_id,folder_id,original_filename,storage_path")
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
  permission: "delete" | "edit" | "open",
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

  if (message.includes("administrator")) {
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

  if (message.includes("administrator")) {
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

function getFileUploadErrorSetup(error: { code?: string; message?: string }) {
  const message = error.message?.toLowerCase() ?? "";

  if (message.includes("too large") || message.includes("size")) {
    return "file-upload-size";
  }

  if (message.includes("folder")) {
    return "file-upload-folder";
  }

  if (message.includes("category")) {
    return "file-upload-category";
  }

  if (message.includes("storage")) {
    return "file-upload-storage";
  }

  if (message.includes("denied")) {
    return "file-upload-permission";
  }

  if (error.code === "23505" || message.includes("duplicate")) {
    return "file-upload-duplicate";
  }

  return "file-upload-error";
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
