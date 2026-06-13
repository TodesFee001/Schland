import { ExternalLink, FileText, Shield } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";

import { hasSupabasePublicEnv, hasSupabaseServerEnv } from "@/lib/env";
import { getDrivePreviewLink } from "@/lib/google-drive";
import {
  createSupabaseServerClient,
  getSupabaseAdminClient,
} from "@/lib/supabase/server";

type PreviewPageProps = {
  searchParams: Promise<{
    fileId?: string;
    setup?: string;
  }>;
};

const fileBucket = "schland-files";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export default async function FilePreviewPage({ searchParams }: PreviewPageProps) {
  const params = await searchParams;
  const fileId = String(params.fileId ?? "").trim();

  if (!hasSupabasePublicEnv() || !hasSupabaseServerEnv()) {
    redirect("/?section=files&setup=missing-supabase");
  }

  if (!isUuidText(fileId)) {
    redirect("/?section=files&setup=file-open-missing");
  }

  const supabase = await createSupabaseServerClient();
  const { data: mfaReady } = await supabase.rpc("has_mfa_level2");

  if (mfaReady !== true) {
    redirect("/?section=files&setup=file-open-aal2");
  }

  const [{ data: canViewFiles }, { data: canOpenFiles }] = await Promise.all([
    supabase.rpc("has_permission", { required_key: "files.view" }),
    supabase.rpc("has_permission", { required_key: "files.open" }),
  ]);

  if (canViewFiles !== true || canOpenFiles !== true) {
    redirect("/?section=files&setup=file-open-permission");
  }

  const admin = getSupabaseAdminClient();
  const { data: file, error } = await admin
    .from("files")
    .select(
      `
        id,
        original_filename,
        file_type,
        file_size,
        storage_path,
        external_url,
        google_drive_file_id,
        google_drive_preview_link,
        google_drive_web_view_link,
        folder_id,
        is_google_doc,
        source,
        source_mime_type,
        sync_status
      `,
    )
    .eq("id", fileId)
    .is("deleted_at", null)
    .maybeSingle();

  if (error || !file?.id) {
    redirect("/?section=files&setup=file-open-missing");
  }

  if (!(await hasFolderOpenPermission(supabase, String(file.folder_id ?? "")))) {
    redirect("/?section=files&setup=file-open-permission");
  }

  const mimeType = String(
    file.source_mime_type ?? file.file_type ?? "application/octet-stream",
  );
  const driveFileId = String(file.google_drive_file_id ?? "");
  const drivePreviewLink =
    String(file.google_drive_preview_link ?? "") ||
    (driveFileId ? getDrivePreviewLink(driveFileId, mimeType) : "");
  const driveWebViewLink = String(
    file.google_drive_web_view_link ?? file.external_url ?? "",
  );
  const signedStorageUrl = await getSignedStorageUrl(admin, {
    externalUrl: String(file.external_url ?? ""),
    storagePath: String(file.storage_path ?? ""),
  });
  const previewUrl = drivePreviewLink || signedStorageUrl;
  const openUrl = driveWebViewLink || signedStorageUrl;
  const isImage = mimeType.startsWith("image/");
  const isPdf = mimeType === "application/pdf";
  const isGoogleDoc =
    Boolean(file.is_google_doc) || mimeType === "application/vnd.google-apps.document";

  return (
    <main className="min-h-screen bg-[var(--background)] p-4 text-[var(--foreground)] md:p-6">
      <section className="mx-auto grid max-w-6xl gap-4">
        <header className="border border-[var(--line-strong)] bg-[var(--surface)]">
          <div className="flex flex-col gap-3 border-b border-[var(--line)] p-4 md:flex-row md:items-center md:justify-between">
            <div className="min-w-0">
              <p className="flex items-center gap-2 text-xs font-bold uppercase text-neutral-500">
                <Shield className="size-4" aria-hidden="true" />
                <span>Dateivorschau</span>
              </p>
              <h1 className="mt-1 truncate text-xl font-semibold">
                {String(file.original_filename ?? "Datei")}
              </h1>
            </div>
            <div className="flex flex-wrap gap-2">
              <Link
                href="/?section=files"
                className="flex h-9 items-center gap-2 border border-[var(--line)] bg-white px-3 text-sm"
              >
                <FileText className="size-4" aria-hidden="true" />
                <span>Dateien</span>
              </Link>
              {openUrl ? (
                <a
                  href={openUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="flex h-9 items-center gap-2 border border-[var(--line-strong)] bg-[var(--foreground)] px-3 text-sm text-white"
                >
                  <ExternalLink className="size-4" aria-hidden="true" />
                  <span>
                    {isGoogleDoc ? "In Google Docs oeffnen" : "Direkt oeffnen"}
                  </span>
                </a>
              ) : null}
            </div>
          </div>
          {params.setup === "google-doc-created" ? (
            <div className="border-b border-[var(--line)] bg-[var(--accent-soft)] px-4 py-3 text-sm text-[var(--accent-strong)]">
              Google-Docs-Kopie wurde erstellt und in der Datei-Datenbank
              registriert.
            </div>
          ) : null}
          <div className="grid gap-2 p-4 text-sm text-neutral-600 md:grid-cols-3">
            <span>Typ: {mimeType}</span>
            <span>Sync: {String(file.sync_status ?? "needs_review")}</span>
            <span>Drive-ID: {driveFileId || "-"}</span>
          </div>
        </header>

        <section className="min-h-[65vh] border border-[var(--line-strong)] bg-[var(--surface)]">
          {previewUrl && (isGoogleDoc || isPdf || drivePreviewLink) ? (
            <iframe
              title="Dateivorschau"
              src={previewUrl}
              className="h-[72vh] w-full bg-white"
            />
          ) : previewUrl && isImage ? (
            <div className="flex min-h-[72vh] items-center justify-center bg-white p-4">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                alt={String(file.original_filename ?? "Datei")}
                src={previewUrl}
                className="max-h-[70vh] max-w-full object-contain"
              />
            </div>
          ) : (
            <div className="grid min-h-[50vh] place-items-center p-6 text-center">
              <div className="max-w-md">
                <FileText
                  className="mx-auto mb-3 size-10 text-[var(--accent)]"
                  aria-hidden="true"
                />
                <h2 className="text-lg font-semibold">
                  Keine eingebettete Vorschau verfuegbar
                </h2>
                <p className="mt-2 text-sm text-neutral-600">
                  Diese Datei kann ueber den Direktlink geoeffnet werden, wird
                  aber nicht inline bearbeitet.
                </p>
              </div>
            </div>
          )}
        </section>
      </section>
    </main>
  );
}

async function getSignedStorageUrl(
  admin: ReturnType<typeof getSupabaseAdminClient>,
  input: {
    externalUrl: string;
    storagePath: string;
  },
) {
  if (!input.storagePath || input.externalUrl) {
    return "";
  }

  const { data } = await admin.storage
    .from(fileBucket)
    .createSignedUrl(input.storagePath, 300);

  return data?.signedUrl ?? "";
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

function isUuidText(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{12}$/i.test(
    value,
  );
}
