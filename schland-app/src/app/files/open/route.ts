import { NextResponse } from "next/server";

import { hasSupabasePublicEnv, hasSupabaseServerEnv } from "@/lib/env";
import {
  createSupabaseServerClient,
  getSupabaseAdminClient,
} from "@/lib/supabase/server";

const FILE_BUCKET = "schland-files";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const fileId = String(url.searchParams.get("fileId") ?? "").trim();
  const memberId = String(url.searchParams.get("memberId") ?? "").trim();

  if (!hasSupabasePublicEnv() || !hasSupabaseServerEnv()) {
    return redirectWithSetup(url, "missing-supabase");
  }

  if (!isUuidText(fileId)) {
    return redirectWithSetup(url, "file-open-missing");
  }

  const supabase = await createSupabaseServerClient();

  const { data: mfaReady } = await supabase.rpc("has_mfa_level2");

  if (mfaReady !== true) {
    return redirectWithSetup(url, "file-open-aal2");
  }

  const { data: canViewFiles } = await supabase.rpc("has_permission", {
    required_key: "files.view",
  });
  const { data: canOpenFiles } = await supabase.rpc("has_permission", {
    required_key: "files.open",
  });

  if (canViewFiles !== true || canOpenFiles !== true) {
    return redirectWithSetup(url, "file-open-permission");
  }

  const admin = getSupabaseAdminClient();
  const { data: file, error: fileError } = await admin
    .from("files")
    .select("id,folder_id,original_filename,storage_path")
    .eq("id", fileId)
    .maybeSingle();

  if (fileError || !file?.id || !file.storage_path) {
    if (fileError) {
      console.error("open file lookup failed", {
        code: fileError.code,
        details: fileError.details,
        message: fileError.message,
      });
    }

    return redirectWithSetup(url, "file-open-missing");
  }

  if (!(await hasFolderOpenPermission(supabase, String(file.folder_id ?? "")))) {
    return redirectWithSetup(url, "file-open-permission");
  }

  if (isUuidText(memberId)) {
    await writeLinkedFileOpenAudit({
      admin,
      fileId,
      memberId,
      supabase,
    });
  }

  const { data, error } = await admin.storage
    .from(FILE_BUCKET)
    .createSignedUrl(String(file.storage_path), 120);

  if (error || !data?.signedUrl) {
    console.error("open file signed url failed", {
      message: error?.message,
    });

    return redirectWithSetup(url, "file-open-error");
  }

  return NextResponse.redirect(data.signedUrl, 303);
}

function redirectWithSetup(url: URL, setup: string) {
  return NextResponse.redirect(
    new URL(`/?section=files&setup=${encodeURIComponent(setup)}`, url),
    303,
  );
}

async function hasFolderOpenPermission(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  folderId: string,
) {
  if (!folderId) {
    return true;
  }

  const { data } = await supabase.rpc("has_folder_permission", {
    p_folder_id: folderId,
    p_permission: "open",
  });

  return data === true;
}

async function writeLinkedFileOpenAudit(input: {
  admin: ReturnType<typeof getSupabaseAdminClient>;
  fileId: string;
  memberId: string;
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>;
}) {
  try {
    const { data: link } = await input.admin
      .from("member_files")
      .select("member_id")
      .eq("member_id", input.memberId)
      .eq("file_id", input.fileId)
      .maybeSingle();

    if (!link?.member_id) {
      return;
    }

    const {
      data: { user },
    } = await input.supabase.auth.getUser();

    if (!user) {
      return;
    }

    const { data: profile } = await input.admin
      .from("profiles")
      .select("display_name,username,email")
      .eq("id", user.id)
      .maybeSingle();

    const username = String(
      profile?.display_name ?? profile?.username ?? profile?.email ?? user.email ?? user.id,
    );

    const { error } = await input.admin.from("member_case_logs").insert({
      action: "open_linked_file",
      member_id: input.memberId,
      reason: "Datei direkt geoeffnet",
      related_file_id: input.fileId,
      success: true,
      user_id: user.id,
      username,
    });

    if (error) {
      console.error("linked file open audit failed", {
        code: error.code,
        details: error.details,
        message: error.message,
      });
    }
  } catch (error) {
    console.error("linked file open audit failed", {
      message: error instanceof Error ? error.message : String(error),
    });
  }
}

function isUuidText(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value,
  );
}
