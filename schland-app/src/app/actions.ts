"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import {
  createPendingDiscordInvites,
  executeDiscordModerationAction,
  runDiscordSync,
} from "@/lib/discord-sync";
import { hasSupabasePublicEnv, hasSupabaseServerEnv } from "@/lib/env";
import { createSupabaseServerClient } from "@/lib/supabase/server";

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
  if (!hasSupabasePublicEnv()) {
    redirect("/?section=members&setup=missing-supabase");
  }

  const memberId = getFormText(formData, "memberId");
  const fileId = getFormText(formData, "fileId");
  const reason = getFormText(formData, "reason");

  if (!memberId || !fileId) {
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

  const { error } = await supabase.rpc("set_member_file_link", {
    p_file_id: fileId,
    p_link: true,
    p_member_id: memberId,
    p_reason: reason,
    p_relation_type: getFormText(formData, "relationType") || "linked",
  });

  if (error) {
    console.error("set_member_file_link link failed", {
      code: error.code,
      details: error.details,
      message: error.message,
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
  if (!hasSupabasePublicEnv()) {
    redirect("/?section=members&setup=missing-supabase");
  }

  const memberId = getFormText(formData, "memberId");
  const fileId = getFormText(formData, "fileId");
  const reason = getFormText(formData, "reason");

  if (!memberId || !fileId) {
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

  const { error } = await supabase.rpc("set_member_file_link", {
    p_file_id: fileId,
    p_link: false,
    p_member_id: memberId,
    p_reason: reason,
    p_relation_type: "linked",
  });

  if (error) {
    console.error("set_member_file_link unlink failed", {
      code: error.code,
      details: error.details,
      message: error.message,
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

  const { data: inviteId, error } = await supabase.rpc(
    "create_discord_invite_request",
    {
      p_invitee_discord_id: inviteeDiscordId,
      p_invitee_name: inviteeName,
      p_reason: reason,
    },
  );

  if (error) {
    console.error("create_discord_invite_request failed", {
      code: error.code,
      details: error.details,
      message: error.message,
    });
    redirect(`/?section=sync&setup=${getDiscordInviteErrorSetup(error)}`);
  }

  let setup = "discord-invite-created";

  if (typeof inviteId === "string" && hasSupabaseServerEnv()) {
    try {
      const liveSync = await createPendingDiscordInvites({
        expireOld: false,
        ids: [inviteId],
        limit: 1,
      });

      if (
        liveSync.failed > 0 ||
        liveSync.dmFailed > 0 ||
        liveSync.created === 0
      ) {
        setup = "discord-invite-live-failed";
      }
    } catch (liveSyncError) {
      console.error("live discord invite sync failed", {
        message:
          liveSyncError instanceof Error
            ? liveSyncError.message
            : String(liveSyncError),
      });
      setup = "discord-invite-live-failed";
    }
  } else {
    setup = "discord-invite-pending";
  }

  revalidatePath("/", "layout");
  redirect(`/?section=sync&setup=${setup}`);
}

export async function runDiscordManualSyncAction() {
  if (!hasSupabasePublicEnv() || !hasSupabaseServerEnv()) {
    redirect("/?section=sync&setup=discord-sync-failed");
  }

  const supabase = await createSupabaseServerClient();

  if (!(await hasMfaLevel2(supabase))) {
    redirect("/?section=sync&setup=discord-sync-aal2");
  }

  try {
    await runDiscordSync("manual");
  } catch (error) {
    console.error("manual discord sync failed", {
      message: error instanceof Error ? error.message : String(error),
    });
    redirect("/?section=sync&setup=discord-sync-failed");
  }

  revalidatePath("/", "layout");
  redirect("/?section=sync&setup=discord-sync-ran");
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
  const actionType = getFormText(formData, "actionType");
  const reason = getFormText(formData, "reason");
  const durationMode =
    getFormText(formData, "durationMode") === "timed" ? "timed" : "lifetime";
  const durationMinutes = getOptionalFormNumber(formData, "durationMinutes");

  if (!memberId || !isModerationAction(actionType)) {
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
      durationMode,
      durationSeconds:
        actionType === "timeout" ? Number(durationMinutes) * 60 : null,
      memberId,
      moderatorName,
      reason,
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
  if (!hasSupabasePublicEnv()) {
    redirect("/?section=files&setup=missing-supabase");
  }

  const fileId = getFormText(formData, "fileId");

  if (!fileId) {
    redirect("/?section=files&setup=file-download-missing");
  }

  const supabase = await createSupabaseServerClient();

  if (!(await hasMfaLevel2(supabase))) {
    redirect("/?section=files&setup=file-download-aal2");
  }

  const { data: fileRow, error: fileError } = await supabase
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

  const { data, error } = await supabase.storage
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

function getMemberFileLinkErrorSetup(error: { code?: string; message?: string }) {
  const message = error.message?.toLowerCase() ?? "";

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

  if (error.code === "23505" || message.includes("duplicate")) {
    return "member-file-duplicate";
  }

  return "member-file-error";
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
