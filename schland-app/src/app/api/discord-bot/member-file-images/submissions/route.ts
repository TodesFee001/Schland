import { randomUUID } from "node:crypto";

import { NextResponse } from "next/server";

import {
  asInteger,
  asIsoDate,
  asRecord,
  asText,
  getDiscordBotAuthError,
  isUuid,
  readJsonObject,
} from "@/lib/discord-bot-api";
import { getSupabaseAdminClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const FILE_BUCKET = "schland-files";
const PROFILE_IMAGE_CATEGORY_NAME = "Profilbilder";
const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const ACTIVE_STATUSES = [
  "pending",
  "message_due",
  "message_sent",
  "invalid_response",
  "overdue",
  "warning_queued",
];
const ALLOWED_IMAGE_TYPES = new Set([
  "image/avif",
  "image/gif",
  "image/heic",
  "image/heif",
  "image/jpeg",
  "image/png",
  "image/webp",
]);

export async function POST(request: Request) {
  const authError = getDiscordBotAuthError(request);

  if (authError) {
    return authError;
  }

  const body = await readJsonObject(request);
  const attachmentUrl = asText(body?.attachmentUrl ?? body?.attachment_url);
  const messageId = asText(body?.messageId ?? body?.message_id);

  if (!attachmentUrl || !messageId) {
    return NextResponse.json(
      { error: "member_image_submission_data_required" },
      { status: 400 },
    );
  }

  const supabase = getSupabaseAdminClient();
  const requestRow = await findRequestForSubmission(supabase, body);

  if (!requestRow) {
    return NextResponse.json(
      { error: "member_image_request_not_found" },
      { status: 404 },
    );
  }

  if (asText(requestRow.status) === "submitted") {
    return NextResponse.json({
      request: mapRequest(requestRow),
      reused: true,
    });
  }

  const requestId = asText(requestRow.id);

  if (!requestId) {
    return NextResponse.json(
      { error: "member_image_request_not_found" },
      { status: 404 },
    );
  }

  const fetched = await fetchDiscordAttachment(attachmentUrl);

  if ("error" in fetched) {
    await markInvalidSubmission(supabase, requestRow, {
      error: fetched.error,
      messageId,
    });

    return NextResponse.json({ error: fetched.error }, { status: fetched.status });
  }

  const contentType = resolveImageContentType({
    fetchedContentType: fetched.contentType,
    filename:
      asText(body?.filename) ??
      filenameFromUrl(attachmentUrl) ??
      attachmentUrl,
    submittedContentType: body?.contentType ?? body?.content_type,
  });

  if (!contentType || !ALLOWED_IMAGE_TYPES.has(contentType)) {
    await markInvalidSubmission(supabase, requestRow, {
      contentType: contentType ?? fetched.contentType,
      error: "member_image_content_type_invalid",
      messageId,
    });

    return NextResponse.json(
      { error: "member_image_content_type_invalid" },
      { status: 400 },
    );
  }

  if (fetched.bytes.byteLength > MAX_IMAGE_BYTES) {
    await markInvalidSubmission(supabase, requestRow, {
      error: "member_image_too_large",
      messageId,
      size: fetched.bytes.byteLength,
    });

    return NextResponse.json({ error: "member_image_too_large" }, { status: 413 });
  }

  const originalFilename =
    sanitizeFilename(asText(body?.filename) ?? "discord-profilbild") ??
    "discord-profilbild";
  const filename = ensureImageExtension(originalFilename, contentType);
  const storagePath = `member-file-images/${requestId}/${randomUUID()}-${filename}`;
  const categoryId = await ensureProfileImageCategory(supabase);
  const { error: uploadError } = await supabase.storage
    .from(FILE_BUCKET)
    .upload(storagePath, fetched.bytes, {
      contentType,
      upsert: false,
    });

  if (uploadError) {
    console.error("member image storage upload failed", {
      message: uploadError.message,
      storagePath,
    });

    return NextResponse.json(
      { error: "member_image_storage_upload_failed" },
      { status: 500 },
    );
  }

  const { data: file, error: fileError } = await supabase
    .from("files")
    .insert({
      category_id: categoryId,
      description:
        "Automatisch per Discord-DM als Mitgliederaktenbild eingereicht.",
      file_size: fetched.bytes.byteLength,
      file_type: contentType,
      filename,
      original_filename: originalFilename,
      storage_path: storagePath,
      tags: ["discord-dm", "mitgliederaktenbild", "profilbild"],
      uploaded_by: null,
    })
    .select("id,filename,storage_path")
    .single();
  const fileRecord = asRecord(file);
  const fileId = asText(fileRecord.id);

  if (fileError || !fileId) {
    await supabase.storage.from(FILE_BUCKET).remove([storagePath]);
    console.error("member image file insert failed", {
      code: fileError?.code,
      details: fileError?.details,
      message: fileError?.message,
    });

    return NextResponse.json(
      { error: "member_image_file_insert_failed" },
      { status: 500 },
    );
  }

  const memberId =
    asText(requestRow.member_id) ??
    (await ensureMemberForRequest(supabase, {
      discordUserId: asText(requestRow.discord_user_id) ?? "",
      discordUsername: asText(requestRow.discord_username),
    }));

  if (memberId) {
    await linkProfileImage(supabase, {
      fileId,
      memberId,
    });
  }

  const submittedAt = asIsoDate(body?.submittedAt ?? body?.submitted_at) ?? new Date().toISOString();
  const metadata = {
    ...asRecord(requestRow.metadata),
    submittedAttachment: {
      contentType,
      filename: originalFilename,
      messageId,
      size: asInteger(body?.size) ?? fetched.bytes.byteLength,
      submittedAt,
      url: attachmentUrl,
    },
    storagePath,
  };
  const { data: updatedRequest, error: updateError } = await supabase
    .from("member_file_image_requests")
    .update({
      file_id: fileId,
      last_error: null,
      member_id: memberId,
      metadata,
      status: "submitted",
      submitted_message_id: messageId,
    })
    .eq("id", requestId)
    .select("*")
    .single();

  if (updateError) {
    console.error("member image request submission update failed", {
      code: updateError.code,
      details: updateError.details,
      message: updateError.message,
    });

    return NextResponse.json(
      { error: "member_image_request_update_failed" },
      { status: 500 },
    );
  }

  await writeRequestLog(supabase, {
    action: "image_submitted",
    actorDiscordUserId: asText(requestRow.discord_user_id),
    details: {
      contentType,
      fileId,
      filename: originalFilename,
      size: fetched.bytes.byteLength,
      storagePath,
    },
    discordMessageId: messageId,
    requestId,
  });

  return NextResponse.json({
    file: {
      filename: asText(fileRecord.filename),
      id: fileId,
      storagePath: asText(fileRecord.storage_path),
    },
    request: mapRequest(updatedRequest),
  });
}

async function fetchDiscordAttachment(url: string) {
  try {
    const response = await fetch(url);

    if (!response.ok) {
      return {
        error: "member_image_download_failed",
        status: 400,
      } as const;
    }

    const contentLength = Number(response.headers.get("content-length") ?? 0);

    if (contentLength > MAX_IMAGE_BYTES) {
      return {
        error: "member_image_too_large",
        status: 413,
      } as const;
    }

    const buffer = await response.arrayBuffer();

    return {
      bytes: new Uint8Array(buffer),
      contentType: response.headers.get("content-type"),
    } as const;
  } catch (error) {
    console.error("member image download failed", error);

    return {
      error: "member_image_download_failed",
      status: 400,
    } as const;
  }
}

async function findRequestForSubmission(
  supabase: ReturnType<typeof getSupabaseAdminClient>,
  body: Record<string, unknown> | null,
) {
  const requestId = asText(body?.requestId ?? body?.request_id);

  if (requestId) {
    if (!isUuid(requestId)) {
      return null;
    }

    const { data, error } = await supabase
      .from("member_file_image_requests")
      .select("*")
      .eq("id", requestId)
      .maybeSingle();

    if (error) {
      throw new Error(`member image submission lookup failed: ${error.message}`);
    }

    return data ? asRecord(data) : null;
  }

  const discordUserId = asText(body?.discordUserId ?? body?.discord_user_id);
  const guildId = asText(body?.guildId ?? body?.guild_id);

  if (!discordUserId || !guildId) {
    return null;
  }

  const { data, error } = await supabase
    .from("member_file_image_requests")
    .select("*")
    .eq("guild_id", guildId)
    .eq("discord_user_id", discordUserId)
    .in("status", ACTIVE_STATUSES)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(`member image active submission lookup failed: ${error.message}`);
  }

  return data ? asRecord(data) : null;
}

async function ensureMemberForRequest(
  supabase: ReturnType<typeof getSupabaseAdminClient>,
  input: { discordUserId: string; discordUsername: string | null },
) {
  if (!input.discordUserId) {
    return null;
  }

  const { data: existing, error: lookupError } = await supabase
    .from("members")
    .select("id")
    .eq("discord_id", input.discordUserId)
    .maybeSingle();

  if (lookupError) {
    throw new Error(`member image member lookup failed: ${lookupError.message}`);
  }

  if (existing?.id) {
    return String(existing.id);
  }

  const { data, error } = await supabase
    .from("members")
    .insert({
      discord_id: input.discordUserId,
      discord_is_bot: false,
      discord_on_server: true,
      discord_username: input.discordUsername,
      name: input.discordUsername ?? input.discordUserId,
      notes: "Automatisch durch Mitgliederaktenbild-Anforderung angelegt.",
    })
    .select("id")
    .single();
  const insertedMemberId = asText(asRecord(data).id);

  if (error || !insertedMemberId) {
    throw new Error(error?.message ?? "member image member insert failed");
  }

  return insertedMemberId;
}

async function ensureProfileImageCategory(
  supabase: ReturnType<typeof getSupabaseAdminClient>,
) {
  const { data: existing, error: lookupError } = await supabase
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

  const { data, error } = await supabase
    .from("file_categories")
    .insert({
      active: true,
      description: "Profilbilder fuer Mitgliederakten.",
      name: PROFILE_IMAGE_CATEGORY_NAME,
      sort_order: 15,
    })
    .select("id")
    .single();
  const insertedCategoryId = asText(asRecord(data).id);

  if (error || !insertedCategoryId) {
    throw new Error(error?.message ?? "profile image category failed");
  }

  return insertedCategoryId;
}

async function linkProfileImage(
  supabase: ReturnType<typeof getSupabaseAdminClient>,
  input: { fileId: string; memberId: string },
) {
  const { error: oldAvatarError } = await supabase
    .from("member_files")
    .delete()
    .eq("member_id", input.memberId)
    .eq("relation_type", "avatar")
    .neq("file_id", input.fileId);

  if (oldAvatarError) {
    throw new Error(oldAvatarError.message);
  }

  const { error: linkError } = await supabase.from("member_files").upsert(
    {
      created_by: null,
      file_id: input.fileId,
      member_id: input.memberId,
      relation_type: "avatar",
    },
    { onConflict: "member_id,file_id" },
  );

  if (linkError) {
    throw new Error(linkError.message);
  }

  const { error: avatarError } = await supabase
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

async function markInvalidSubmission(
  supabase: ReturnType<typeof getSupabaseAdminClient>,
  requestRow: Record<string, unknown>,
  details: Record<string, unknown>,
) {
  const requestId = asText(requestRow.id);

  if (!requestId) {
    return;
  }

  const metadata = {
    ...asRecord(requestRow.metadata),
    lastInvalidResponseAt: new Date().toISOString(),
    lastInvalidResponse: details,
  };

  await supabase
    .from("member_file_image_requests")
    .update({
      last_error: asText(details.error),
      metadata,
      status: "invalid_response",
    })
    .eq("id", requestId);

  await writeRequestLog(supabase, {
    action: "invalid_response_received",
    actorDiscordUserId: asText(requestRow.discord_user_id),
    details,
    discordMessageId: asText(details.messageId),
    requestId,
  });
}

async function writeRequestLog(
  supabase: ReturnType<typeof getSupabaseAdminClient>,
  input: {
    action: string;
    actorDiscordUserId?: string | null;
    details?: Record<string, unknown>;
    discordMessageId?: string | null;
    requestId: string;
  },
) {
  const { error } = await supabase.from("member_file_image_request_logs").insert({
    action: input.action,
    actor_discord_user_id: input.actorDiscordUserId ?? null,
    details: input.details ?? {},
    discord_message_id: input.discordMessageId ?? null,
    request_id: input.requestId,
  });

  if (error) {
    console.error("member image submission log failed", {
      code: error.code,
      details: error.details,
      message: error.message,
    });
  }
}

function normalizeContentType(value: unknown) {
  return asText(value)?.split(";")[0]?.trim().toLowerCase() ?? null;
}

function resolveImageContentType(input: {
  fetchedContentType: unknown;
  filename: string;
  submittedContentType: unknown;
}) {
  const fetched = normalizeContentType(input.fetchedContentType);
  const submitted = normalizeContentType(input.submittedContentType);
  const inferred = inferImageContentType(input.filename);

  if (fetched && ALLOWED_IMAGE_TYPES.has(fetched)) {
    return fetched;
  }

  if (submitted && ALLOWED_IMAGE_TYPES.has(submitted)) {
    return submitted;
  }

  if (
    inferred &&
    (!fetched || isGenericBinaryContentType(fetched)) &&
    (!submitted || isGenericBinaryContentType(submitted))
  ) {
    return inferred;
  }

  return fetched ?? submitted ?? inferred;
}

function isGenericBinaryContentType(value: string) {
  return value === "application/octet-stream" || value === "binary/octet-stream";
}

function sanitizeFilename(value: string | null) {
  return value
    ?.replace(/[^\w.-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120);
}

function ensureImageExtension(filename: string, contentType: string) {
  const current = filename.toLowerCase();

  if (/\.(avif|gif|hei[cf]|jpe?g|png|webp)$/.test(current)) {
    return filename;
  }

  const extensionByType: Record<string, string> = {
    "image/avif": "avif",
    "image/gif": "gif",
    "image/heic": "heic",
    "image/heif": "heif",
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
  };

  return `${filename}.${extensionByType[contentType] ?? "img"}`;
}

function inferImageContentType(value: string | null) {
  const text = value?.split("?")[0]?.toLowerCase() ?? "";

  if (text.endsWith(".avif")) {
    return "image/avif";
  }

  if (text.endsWith(".gif")) {
    return "image/gif";
  }

  if (text.endsWith(".heic")) {
    return "image/heic";
  }

  if (text.endsWith(".heif")) {
    return "image/heif";
  }

  if (text.endsWith(".jpg") || text.endsWith(".jpeg")) {
    return "image/jpeg";
  }

  if (text.endsWith(".png")) {
    return "image/png";
  }

  if (text.endsWith(".webp")) {
    return "image/webp";
  }

  return null;
}

function filenameFromUrl(value: string) {
  try {
    const pathname = new URL(value).pathname;
    const filename = pathname.split("/").filter(Boolean).pop();

    return filename ? decodeURIComponent(filename) : null;
  } catch {
    return null;
  }
}

function mapRequest(row: unknown) {
  const request = asRecord(row);

  return {
    deadlineAt: asText(request.deadline_at),
    discordUserId: asText(request.discord_user_id),
    fileId: asText(request.file_id),
    id: asText(request.id),
    lastError: asText(request.last_error),
    memberId: asText(request.member_id),
    status: asText(request.status),
    submittedMessageId: asText(request.submitted_message_id),
  };
}
