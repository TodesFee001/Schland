import {
  getDrivePreviewLink,
  getDriveWebViewLink,
  getGoogleDocsTemplateId,
  getGoogleDriveRootFolderId,
  GoogleDriveClient,
  hasGoogleDriveServerConfig,
  isGoogleDocsMimeType,
  isGoogleFolderMimeType,
  type DriveFile,
} from "@/lib/google-drive";
import { getSupabaseAdminClient } from "@/lib/supabase/server";

type SupabaseAdmin = ReturnType<typeof getSupabaseAdminClient>;

export type DriveSyncTriggerType = "manual" | "scheduled_06" | "scheduled_20";

type SyncCounters = {
  conflictsFound: number;
  errorsFound: number;
  filesCreated: number;
  filesMoved: number;
  filesScanned: number;
  filesUpdated: number;
  foldersCreated: number;
  foldersUpdated: number;
};

type LocalFolder = {
  categoryId: string;
  categoryName: string;
  googleDriveFolderId: string;
  googleDriveParentId: string;
  id: string;
  name: string;
  parentFolderId: string;
  path: string;
};

type LocalFile = {
  categoryId: string;
  deletedAt: string;
  fileSize: number;
  fileType: string;
  folderId: string;
  googleDriveFileId: string;
  googleDriveParentId: string;
  id: string;
  originalFilename: string;
  source: string;
  storagePath: string;
};

type DriveTree = {
  files: DriveFile[];
  folders: DriveFile[];
};

const fileBucket = "schland-files";
const fallbackCategoryName = "Ungeordnet";
const reviewFolderName = "Zu pruefen";
const defaultCounters: SyncCounters = {
  conflictsFound: 0,
  errorsFound: 0,
  filesCreated: 0,
  filesMoved: 0,
  filesScanned: 0,
  filesUpdated: 0,
  foldersCreated: 0,
  foldersUpdated: 0,
};

export async function runDriveSync(input: {
  triggeredBy?: string | null;
  triggerType: DriveSyncTriggerType;
}) {
  const admin = getSupabaseAdminClient();
  const activeRun = await getActiveDriveSyncRun(admin);

  if (activeRun) {
    const skippedRun = await createSyncRun(admin, {
      status: "skipped",
      triggeredBy: input.triggeredBy ?? null,
      triggerType: input.triggerType,
    });

    await finishSyncRun(admin, skippedRun.id, {
      ...defaultCounters,
      errorsFound: 0,
    }, {
      reason: "already_running",
      runningRunId: activeRun.id,
    });

    return {
      id: skippedRun.id,
      skipped: true,
      status: "skipped",
    };
  }

  const syncRun = await createSyncRun(admin, {
    status: "running",
    triggeredBy: input.triggeredBy ?? null,
    triggerType: input.triggerType,
  });
  const counters = { ...defaultCounters };

  try {
    await writeSyncLog(admin, {
      message: "Google-Drive-Sync gestartet.",
      status: "started",
      syncRunId: syncRun.id,
    });

    if (!hasGoogleDriveServerConfig()) {
      throw new Error("google_drive_not_configured");
    }

    const drive = new GoogleDriveClient();
    const rootFolderId = getGoogleDriveRootFolderId();
    const [localFiles, driveTree] = await Promise.all([
      getLocalFiles(admin),
      drive.listTree(rootFolderId),
    ]);

    counters.filesScanned = localFiles.length + driveTree.files.length;

    await ensureFallbackStructure(admin, drive, syncRun.id, counters);
    const refreshedFolders = await getLocalFolders(admin);
    await syncLocalFoldersToDrive(admin, drive, syncRun.id, refreshedFolders, counters);
    const syncedLocalFolders = await getLocalFolders(admin);
    await syncDriveFoldersToLocal(
      admin,
      syncRun.id,
      syncedLocalFolders,
      driveTree,
      counters,
    );
    const finalFolders = await getLocalFolders(admin);
    await syncDriveFilesToLocal(admin, syncRun.id, finalFolders, driveTree, counters);
    await syncLocalFilesToDrive(
      admin,
      drive,
      syncRun.id,
      finalFolders,
      await getLocalFiles(admin),
      driveTree,
      counters,
    );

    await finishSyncRun(admin, syncRun.id, counters, {
      rootFolderId,
      templateId: getGoogleDocsTemplateId(),
    });

    return {
      counters,
      id: syncRun.id,
      skipped: false,
      status: counters.errorsFound > 0 ? "partial" : "success",
    };
  } catch (error) {
    counters.errorsFound += 1;
    await writeSyncLog(admin, {
      errorMessage: getErrorMessage(error),
      message: "Google-Drive-Sync fehlgeschlagen.",
      status: "failed",
      syncRunId: syncRun.id,
    });
    await finishSyncRun(
      admin,
      syncRun.id,
      counters,
      {
        error: getErrorMessage(error),
      },
      "failed",
    );

    throw error;
  }
}

export async function uploadFileRecordToDrive(fileId: string) {
  if (!hasGoogleDriveServerConfig()) {
    return {
      ok: false,
      reason: "google_drive_not_configured",
    };
  }

  const admin = getSupabaseAdminClient();
  const file = await getLocalFileById(admin, fileId);

  if (!file || file.googleDriveFileId || file.deletedAt) {
    return {
      ok: false,
      reason: "file_not_uploadable",
    };
  }

  const folder = file.folderId ? await getLocalFolderById(admin, file.folderId) : null;
  const drive = new GoogleDriveClient();
  const targetFolderId = await ensureDriveTargetFolder(admin, drive, folder);
  const upload = await uploadStorageFileToDrive(admin, drive, file, targetFolderId);

  return {
    driveFileId: upload.id,
    ok: true,
  };
}

export async function ensureFolderRecordOnDrive(folderId: string) {
  if (!hasGoogleDriveServerConfig()) {
    return {
      ok: false,
      reason: "google_drive_not_configured",
    };
  }

  const admin = getSupabaseAdminClient();
  const folder = await getLocalFolderById(admin, folderId);

  if (!folder) {
    return {
      ok: false,
      reason: "folder_not_found",
    };
  }

  const drive = new GoogleDriveClient();
  await ensureDriveTargetFolder(admin, drive, folder);

  return {
    ok: true,
  };
}

export async function moveDriveFileForRecord(fileId: string) {
  if (!hasGoogleDriveServerConfig()) {
    return {
      ok: false,
      reason: "google_drive_not_configured",
    };
  }

  const admin = getSupabaseAdminClient();
  const file = await getLocalFileById(admin, fileId);

  if (!file?.googleDriveFileId || file.deletedAt) {
    return {
      ok: false,
      reason: "file_has_no_drive_id",
    };
  }

  const folder = file.folderId ? await getLocalFolderById(admin, file.folderId) : null;
  const drive = new GoogleDriveClient();
  const targetFolderId = await ensureDriveTargetFolder(admin, drive, folder);
  const driveFile = await drive.getFile(file.googleDriveFileId);

  if (driveFile.parents.includes(targetFolderId)) {
    return {
      ok: true,
      skipped: true,
    };
  }

  const moved = await drive.moveFile({
    fileId: file.googleDriveFileId,
    previousParents: driveFile.parents,
    targetParentId: targetFolderId,
  });

  await updateFileFromDrive(admin, file.id, moved, targetFolderId, "synced");

  return {
    ok: true,
  };
}

export async function createGoogleDocFromTemplate(input: {
  actorId: string;
  description?: string | null;
  folderId: string;
  name: string;
  tags?: string[];
}) {
  if (!hasGoogleDriveServerConfig()) {
    throw new Error("google_drive_not_configured");
  }

  const admin = getSupabaseAdminClient();
  const folder = await getLocalFolderById(admin, input.folderId);

  if (!folder) {
    throw new Error("folder_not_found");
  }

  const cleanName = normalizeName(input.name);

  if (!cleanName || cleanName.length < 2) {
    throw new Error("document_name_required");
  }

  const { data: folderFiles } = await admin
    .from("files")
    .select("id, filename, original_filename")
    .eq("folder_id", input.folderId)
    .is("deleted_at", null)
    .limit(500);

  const duplicate = (folderFiles ?? []).find((file) =>
    [file.original_filename, file.filename].some(
      (value) => normalizeName(String(value ?? "")).toLowerCase() === cleanName.toLowerCase(),
    ),
  );

  if (duplicate?.id) {
    throw new Error("document_name_conflict");
  }

  const drive = new GoogleDriveClient();
  const targetFolderId = await ensureDriveTargetFolder(admin, drive, folder);
  const copy = await drive.copyTemplateToGoogleDoc({
    name: cleanName,
    parentId: targetFolderId,
  });
  const webViewLink = copy.webViewLink || getDriveWebViewLink(copy.id, copy.mimeType);
  const previewLink = getDrivePreviewLink(copy.id, copy.mimeType);
  const { data, error } = await admin
    .from("files")
    .insert({
      category_id: folder.categoryId,
      description: input.description ?? "Aus Google-Docs-Vorlage erstellt.",
      extension: isGoogleDocsMimeType(copy.mimeType) ? "gdoc" : getExtension(cleanName),
      external_url: webViewLink,
      file_size: Number(copy.size ?? 0),
      file_type: copy.mimeType,
      filename: isGoogleDocsMimeType(copy.mimeType)
        ? `${sanitizeStorageName(cleanName)}.gdoc`
        : sanitizeStorageName(cleanName),
      folder_id: folder.id,
      google_drive_file_id: copy.id,
      google_drive_parent_id: targetFolderId,
      google_drive_preview_link: previewLink,
      google_drive_web_view_link: webViewLink,
      is_google_doc: isGoogleDocsMimeType(copy.mimeType),
      is_template_copy: true,
      last_synced_at: new Date().toISOString(),
      original_filename: cleanName,
      source: "generated_from_template",
      source_id: copy.id,
      source_mime_type: copy.mimeType,
      storage_path: `google-drive/${copy.id}`,
      sync_status: "synced",
      tags: input.tags ?? ["google-docs", "vorlage"],
      template_source_id: getGoogleDocsTemplateId(),
      uploaded_by: input.actorId,
    })
    .select("id")
    .single();

  if (error || !data?.id) {
    throw new Error(error?.message ?? "document_registration_failed");
  }

  await admin.from("systemprotokoll").insert({
    aktion: "google_doc_created",
    benutzer_id: input.actorId,
    bereich: "files",
    details: `file=${String(data.id)}; drive=${copy.id}; folder=${folder.id}`,
  });

  return {
    fileId: String(data.id),
    webViewLink,
  };
}

async function syncLocalFoldersToDrive(
  admin: SupabaseAdmin,
  drive: GoogleDriveClient,
  syncRunId: string,
  folders: LocalFolder[],
  counters: SyncCounters,
) {
  const byId = new Map(folders.map((folder) => [folder.id, folder]));
  const pending = folders.filter((folder) => !folder.googleDriveFolderId);
  let changed = true;

  while (pending.length > 0 && changed) {
    changed = false;

    for (let index = pending.length - 1; index >= 0; index -= 1) {
      const folder = pending[index];
      const parent = folder.parentFolderId ? byId.get(folder.parentFolderId) : null;

      if (folder.parentFolderId && !parent?.googleDriveFolderId) {
        continue;
      }

      const parentDriveId = parent?.googleDriveFolderId || getGoogleDriveRootFolderId();
      const created = await drive.createFolder({
        name: folder.name,
        parentId: parentDriveId,
      });

      await admin
        .from("folders")
        .update({
          google_drive_folder_id: created.id,
          google_drive_parent_id: parentDriveId,
          last_synced_at: new Date().toISOString(),
          path: buildFolderPath(folder, byId),
          sync_status: "synced",
        })
        .eq("id", folder.id);

      folder.googleDriveFolderId = created.id;
      folder.googleDriveParentId = parentDriveId;
      counters.foldersCreated += 1;
      changed = true;
      pending.splice(index, 1);

      await writeSyncLog(admin, {
        direction: "website_to_drive",
        entityId: folder.id,
        entityType: "folder",
        googleDriveId: created.id,
        message: `Drive-Ordner erstellt: ${folder.name}`,
        status: "success",
        syncRunId,
      });
    }
  }

  for (const folder of pending) {
    counters.conflictsFound += 1;
    await createConflict(admin, {
      conflictType: "folder_parent_missing_drive_id",
      entityType: "folder",
      localEntityId: folder.id,
      localValue: folder,
      syncRunId,
    });
  }
}

async function syncDriveFoldersToLocal(
  admin: SupabaseAdmin,
  syncRunId: string,
  localFolders: LocalFolder[],
  driveTree: DriveTree,
  counters: SyncCounters,
) {
  const byDriveId = new Map(
    localFolders
      .filter((folder) => folder.googleDriveFolderId)
      .map((folder) => [folder.googleDriveFolderId, folder]),
  );
  const byId = new Map(localFolders.map((folder) => [folder.id, folder]));
  const driveFoldersById = new Map(driveTree.folders.map((folder) => [folder.id, folder]));

  for (const driveFolder of driveTree.folders) {
    const existing = byDriveId.get(driveFolder.id);

    if (existing) {
      const parentDriveId = driveFolder.parents[0] ?? "";
      const nextPath = buildDrivePath(driveFolder, driveFoldersById);

      await admin
        .from("folders")
        .update({
          drive_modified_at: driveFolder.modifiedTime || null,
          google_drive_parent_id: parentDriveId,
          last_synced_at: new Date().toISOString(),
          name: driveFolder.name,
          path: nextPath || existing.path || driveFolder.name,
          sync_status: "synced",
        })
        .eq("id", existing.id);
      counters.foldersUpdated += 1;
      continue;
    }

    const parentDriveId = driveFolder.parents[0] ?? "";
    const parentFolder = byDriveId.get(parentDriveId);
    const topLevelName = getTopLevelDriveFolderName(driveFolder, driveFoldersById);
    const categoryId = await ensureCategory(admin, topLevelName || fallbackCategoryName);
    const matchingFolder = localFolders.find(
      (folder) =>
        folder.categoryId === categoryId &&
        folder.parentFolderId === (parentFolder?.id ?? "") &&
        folder.name === driveFolder.name &&
        !folder.googleDriveFolderId,
    );

    if (matchingFolder) {
      await admin
        .from("folders")
        .update({
          drive_modified_at: driveFolder.modifiedTime || null,
          google_drive_folder_id: driveFolder.id,
          google_drive_parent_id: parentDriveId,
          last_synced_at: new Date().toISOString(),
          path: buildDrivePath(driveFolder, driveFoldersById),
          sync_status: "synced",
        })
        .eq("id", matchingFolder.id);
      byDriveId.set(driveFolder.id, {
        ...matchingFolder,
        googleDriveFolderId: driveFolder.id,
      });
      counters.foldersUpdated += 1;
      continue;
    }

    const { data, error } = await admin
      .from("folders")
      .insert({
        category_id: categoryId,
        drive_modified_at: driveFolder.modifiedTime || null,
        google_drive_folder_id: driveFolder.id,
        google_drive_parent_id: parentDriveId,
        name: driveFolder.name,
        parent_folder_id: parentFolder?.id || null,
        path: buildDrivePath(driveFolder, driveFoldersById),
        sync_status: "synced",
        last_synced_at: new Date().toISOString(),
      })
      .select("id")
      .single();

    if (error || !data?.id) {
      counters.conflictsFound += 1;
      await createConflict(admin, {
        conflictType: "drive_folder_insert_failed",
        driveValue: driveFolder,
        entityType: "folder",
        googleDriveId: driveFolder.id,
        syncRunId,
      });
      continue;
    }

    const folder: LocalFolder = {
      categoryId,
      categoryName: topLevelName || fallbackCategoryName,
      googleDriveFolderId: driveFolder.id,
      googleDriveParentId: parentDriveId,
      id: String(data.id),
      name: driveFolder.name,
      parentFolderId: parentFolder?.id ?? "",
      path: buildDrivePath(driveFolder, driveFoldersById),
    };

    localFolders.push(folder);
    byDriveId.set(driveFolder.id, folder);
    byId.set(folder.id, folder);
    counters.foldersCreated += 1;
  }
}

async function syncDriveFilesToLocal(
  admin: SupabaseAdmin,
  syncRunId: string,
  folders: LocalFolder[],
  driveTree: DriveTree,
  counters: SyncCounters,
) {
  const localFiles = await getLocalFiles(admin);
  const byDriveId = new Map(
    localFiles
      .filter((file) => file.googleDriveFileId)
      .map((file) => [file.googleDriveFileId, file]),
  );
  const folderByDriveId = new Map(
    folders
      .filter((folder) => folder.googleDriveFolderId)
      .map((folder) => [folder.googleDriveFolderId, folder]),
  );
  const reviewFolder = await ensureReviewFolder(admin);

  for (const driveFile of driveTree.files) {
    if (isGoogleFolderMimeType(driveFile.mimeType)) {
      continue;
    }

    const parentDriveId = driveFile.parents[0] ?? "";
    const folder = folderByDriveId.get(parentDriveId) ?? reviewFolder;
    const existing = byDriveId.get(driveFile.id);
    const sameNameDifferentDriveId = localFiles.find(
      (file) =>
        file.folderId === folder.id &&
        file.originalFilename === driveFile.name &&
        file.googleDriveFileId &&
        file.googleDriveFileId !== driveFile.id,
    );

    if (sameNameDifferentDriveId) {
      counters.conflictsFound += 1;
      await createConflict(admin, {
        conflictType: "same_filename_different_drive_file",
        driveValue: driveFile,
        entityType: "file",
        googleDriveId: driveFile.id,
        localEntityId: sameNameDifferentDriveId.id,
        localValue: sameNameDifferentDriveId,
        syncRunId,
      });
    }

    if (existing) {
      await updateFileFromDrive(admin, existing.id, driveFile, parentDriveId, "synced", {
        categoryId: folder.categoryId,
        folderId: folder.id,
      });
      counters.filesUpdated += 1;
      continue;
    }

    const webViewLink =
      driveFile.webViewLink || getDriveWebViewLink(driveFile.id, driveFile.mimeType);
    const previewLink = getDrivePreviewLink(driveFile.id, driveFile.mimeType);
    const { error } = await admin.from("files").insert({
      category_id: folder.categoryId,
      description: "Per Google-Drive-Sync uebernommen.",
      drive_modified_at: driveFile.modifiedTime || null,
      extension: getExtension(driveFile.name),
      external_url: webViewLink,
      file_size: Number(driveFile.size ?? 0),
      file_type: driveFile.mimeType || "application/octet-stream",
      filename: `${sanitizeStorageName(driveFile.name)}.gdrive`,
      folder_id: folder.id,
      google_drive_file_id: driveFile.id,
      google_drive_parent_id: parentDriveId,
      google_drive_preview_link: previewLink,
      google_drive_web_view_link: webViewLink,
      is_google_doc: isGoogleDocsMimeType(driveFile.mimeType),
      last_synced_at: new Date().toISOString(),
      original_filename: driveFile.name,
      source: "google_drive",
      source_id: driveFile.id,
      source_mime_type: driveFile.mimeType,
      storage_path: `google-drive/${driveFile.id}`,
      sync_status: "synced",
      tags: ["drive-sync"],
    });

    if (error) {
      counters.conflictsFound += 1;
      await createConflict(admin, {
        conflictType: "drive_file_insert_failed",
        driveValue: driveFile,
        entityType: "file",
        googleDriveId: driveFile.id,
        syncRunId,
      });
      continue;
    }

    counters.filesCreated += 1;
  }
}

async function syncLocalFilesToDrive(
  admin: SupabaseAdmin,
  drive: GoogleDriveClient,
  syncRunId: string,
  folders: LocalFolder[],
  localFiles: LocalFile[],
  driveTree: DriveTree,
  counters: SyncCounters,
) {
  const driveIds = new Set(driveTree.files.map((file) => file.id));
  const driveFileById = new Map(driveTree.files.map((file) => [file.id, file]));
  const folderById = new Map(folders.map((folder) => [folder.id, folder]));

  for (const file of localFiles) {
    if (file.deletedAt) {
      continue;
    }

    if (file.googleDriveFileId && !driveIds.has(file.googleDriveFileId)) {
      counters.conflictsFound += 1;
      await admin
        .from("files")
        .update({
          sync_status: "orphaned",
          updated_at: new Date().toISOString(),
        })
        .eq("id", file.id);
      await createConflict(admin, {
        conflictType: "db_file_missing_in_drive",
        entityType: "file",
        googleDriveId: file.googleDriveFileId,
        localEntityId: file.id,
        localValue: file,
        syncRunId,
      });
      continue;
    }

    const folder = file.folderId ? folderById.get(file.folderId) : null;
    const targetFolderId = folder?.googleDriveFolderId || getGoogleDriveRootFolderId();

    if (!file.googleDriveFileId) {
      if (file.storagePath.startsWith("google-drive/")) {
        counters.conflictsFound += 1;
        await createConflict(admin, {
          conflictType: "db_drive_placeholder_without_drive_id",
          entityType: "file",
          localEntityId: file.id,
          localValue: file,
          syncRunId,
        });
        continue;
      }

      try {
        await uploadStorageFileToDrive(admin, drive, file, targetFolderId);
        counters.filesCreated += 1;
      } catch (error) {
        counters.errorsFound += 1;
        await admin
          .from("files")
          .update({
            metadata: { driveUploadError: getErrorMessage(error) },
            sync_status: "failed",
            updated_at: new Date().toISOString(),
          })
          .eq("id", file.id);
        await writeSyncLog(admin, {
          direction: "website_to_drive",
          entityId: file.id,
          entityType: "file",
          errorMessage: getErrorMessage(error),
          message: `Drive-Upload fehlgeschlagen: ${file.originalFilename}`,
          status: "failed",
          syncRunId,
        });
      }

      continue;
    }

    const driveFile = driveFileById.get(file.googleDriveFileId);

    if (
      driveFile &&
      targetFolderId &&
      !driveFile.parents.includes(targetFolderId)
    ) {
      const moved = await drive.moveFile({
        fileId: file.googleDriveFileId,
        previousParents: driveFile.parents,
        targetParentId: targetFolderId,
      });

      await updateFileFromDrive(admin, file.id, moved, targetFolderId, "synced");
      counters.filesMoved += 1;
    }
  }
}

async function uploadStorageFileToDrive(
  admin: SupabaseAdmin,
  drive: GoogleDriveClient,
  file: LocalFile,
  targetFolderId: string,
) {
  const { data, error } = await admin.storage
    .from(fileBucket)
    .download(file.storagePath);

  if (error || !data) {
    throw new Error(error?.message ?? "storage_file_missing");
  }

  const body = new Uint8Array(await data.arrayBuffer());
  const uploaded = await drive.uploadFile({
    body,
    mimeType: file.fileType,
    name: file.originalFilename,
    parentId: targetFolderId,
  });

  await updateFileFromDrive(admin, file.id, uploaded, targetFolderId, "synced", {
    source: file.source === "supabase" ? "website_upload" : file.source,
  });

  return uploaded;
}

async function ensureDriveTargetFolder(
  admin: SupabaseAdmin,
  drive: GoogleDriveClient,
  folder: LocalFolder | null,
) {
  if (!folder) {
    return getGoogleDriveRootFolderId();
  }

  if (folder.googleDriveFolderId) {
    return folder.googleDriveFolderId;
  }

  const parent = folder.parentFolderId
    ? await getLocalFolderById(admin, folder.parentFolderId)
    : null;
  const parentDriveId = await ensureDriveTargetFolder(admin, drive, parent);
  const created = await drive.createFolder({
    name: folder.name,
    parentId: parentDriveId,
  });

  await admin
    .from("folders")
    .update({
      google_drive_folder_id: created.id,
      google_drive_parent_id: parentDriveId,
      last_synced_at: new Date().toISOString(),
      sync_status: "synced",
    })
    .eq("id", folder.id);

  return created.id;
}

async function updateFileFromDrive(
  admin: SupabaseAdmin,
  fileId: string,
  driveFile: DriveFile,
  parentDriveId: string,
  syncStatus: string,
  options: {
    categoryId?: string;
    folderId?: string;
    source?: string;
  } = {},
) {
  const mimeType = driveFile.mimeType || "application/octet-stream";

  await admin
    .from("files")
    .update({
      ...(options.categoryId ? { category_id: options.categoryId } : {}),
      ...(options.folderId ? { folder_id: options.folderId } : {}),
      ...(options.source ? { source: options.source } : {}),
      drive_modified_at: driveFile.modifiedTime || null,
      external_url: driveFile.webViewLink || getDriveWebViewLink(driveFile.id, mimeType),
      file_size: Number(driveFile.size ?? 0),
      file_type: mimeType,
      google_drive_file_id: driveFile.id,
      google_drive_parent_id: parentDriveId,
      google_drive_preview_link: getDrivePreviewLink(driveFile.id, mimeType),
      google_drive_web_view_link:
        driveFile.webViewLink || getDriveWebViewLink(driveFile.id, mimeType),
      is_google_doc: isGoogleDocsMimeType(mimeType),
      last_synced_at: new Date().toISOString(),
      source_id: driveFile.id,
      source_mime_type: mimeType,
      sync_status: syncStatus,
      updated_at: new Date().toISOString(),
    })
    .eq("id", fileId);
}

async function ensureFallbackStructure(
  admin: SupabaseAdmin,
  drive: GoogleDriveClient,
  syncRunId: string,
  counters: SyncCounters,
) {
  const categoryId = await ensureCategory(admin, fallbackCategoryName);
  const existing = await ensureReviewFolder(admin, categoryId);

  if (!existing.googleDriveFolderId) {
    const created = await drive.createFolder({
      name: reviewFolderName,
      parentId: getGoogleDriveRootFolderId(),
    });

    await admin
      .from("folders")
      .update({
        google_drive_folder_id: created.id,
        google_drive_parent_id: getGoogleDriveRootFolderId(),
        last_synced_at: new Date().toISOString(),
        sync_status: "synced",
      })
      .eq("id", existing.id);

    counters.foldersCreated += 1;
    await writeSyncLog(admin, {
      direction: "website_to_drive",
      entityId: existing.id,
      entityType: "folder",
      googleDriveId: created.id,
      message: "Fallback-Ordner Zu pruefen in Drive erstellt.",
      status: "success",
      syncRunId,
    });
  }
}

async function ensureCategory(admin: SupabaseAdmin, name: string) {
  const cleanName = normalizeName(name) || fallbackCategoryName;
  const { data: existing, error: existingError } = await admin
    .from("file_categories")
    .select("id")
    .eq("name", cleanName)
    .maybeSingle();

  if (existingError) {
    throw new Error(existingError.message);
  }

  if (existing?.id) {
    return String(existing.id);
  }

  const { data, error } = await admin
    .from("file_categories")
    .insert({
      active: true,
      description: "Automatisch fuer Google-Drive-Sync angelegt.",
      name: cleanName,
      sort_order: cleanName === fallbackCategoryName ? 90 : 50,
    })
    .select("id")
    .single();

  if (error || !data?.id) {
    throw new Error(error?.message ?? "category_insert_failed");
  }

  return String(data.id);
}

async function ensureReviewFolder(admin: SupabaseAdmin, categoryId?: string) {
  const effectiveCategoryId = categoryId ?? (await ensureCategory(admin, fallbackCategoryName));
  const { data: existing, error: existingError } = await admin
    .from("folders")
    .select(
      "id,name,parent_folder_id,category_id,google_drive_folder_id,google_drive_parent_id,path,file_categories(name)",
    )
    .eq("category_id", effectiveCategoryId)
    .eq("name", reviewFolderName)
    .is("deleted_at", null)
    .maybeSingle();

  if (existingError) {
    throw new Error(existingError.message);
  }

  if (existing?.id) {
    return mapFolderRow(existing);
  }

  const { data, error } = await admin
    .from("folders")
    .insert({
      category_id: effectiveCategoryId,
      name: reviewFolderName,
      path: reviewFolderName,
      sync_status: "needs_review",
    })
    .select(
      "id,name,parent_folder_id,category_id,google_drive_folder_id,google_drive_parent_id,path,file_categories(name)",
    )
    .single();

  if (error || !data?.id) {
    throw new Error(error?.message ?? "review_folder_insert_failed");
  }

  return mapFolderRow(data);
}

async function getActiveDriveSyncRun(admin: SupabaseAdmin) {
  const cutoff = new Date(Date.now() - 30 * 60 * 1000).toISOString();
  const { data } = await admin
    .from("sync_runs")
    .select("id")
    .eq("source", "google-drive")
    .eq("status", "running")
    .gte("started_at", cutoff)
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  return data ? { id: String(data.id) } : null;
}

async function createSyncRun(
  admin: SupabaseAdmin,
  input: {
    status: string;
    triggeredBy: string | null;
    triggerType: string;
  },
) {
  const { data, error } = await admin
    .from("sync_runs")
    .insert({
      metadata: {
        implementation: "google-drive-safe-sync",
      },
      source: "google-drive",
      status: input.status,
      trigger_type: input.triggerType,
      triggered_by: input.triggeredBy,
    })
    .select("id")
    .single();

  if (error || !data?.id) {
    throw new Error(error?.message ?? "sync_run_insert_failed");
  }

  return {
    id: String(data.id),
  };
}

async function finishSyncRun(
  admin: SupabaseAdmin,
  syncRunId: string,
  counters: SyncCounters,
  summary: Record<string, unknown> = {},
  forcedStatus?: string,
) {
  const status =
    forcedStatus ??
    (counters.errorsFound > 0
      ? "partial"
      : counters.conflictsFound > 0
        ? "partial"
        : "success");

  await admin
    .from("sync_runs")
    .update({
      conflicts_found: counters.conflictsFound,
      error_message:
        status === "failed" ? String(summary.error ?? "drive_sync_failed") : null,
      errors_found: counters.errorsFound,
      files_created: counters.filesCreated,
      files_moved: counters.filesMoved,
      files_scanned: counters.filesScanned,
      files_updated: counters.filesUpdated,
      finished_at: new Date().toISOString(),
      folders_created: counters.foldersCreated,
      folders_updated: counters.foldersUpdated,
      metadata: {
        implementation: "google-drive-safe-sync",
        ...summary,
      },
      status,
      summary: {
        ...counters,
        ...summary,
      },
    })
    .eq("id", syncRunId);
}

async function writeSyncLog(
  admin: SupabaseAdmin,
  input: {
    direction?: string;
    entityId?: string;
    entityType?: string;
    errorMessage?: string;
    googleDriveId?: string;
    message: string;
    status: string;
    syncRunId: string;
  },
) {
  await admin.from("drive_sync_logs").insert({
    direction: input.direction ?? "bidirectional",
    entity_id: input.entityId ?? null,
    entity_type: input.entityType ?? null,
    error_message: input.errorMessage ?? null,
    finished_at:
      input.status === "started" ? null : new Date().toISOString(),
    google_drive_id: input.googleDriveId ?? null,
    message: input.message,
    status: input.status,
    sync_run_id: input.syncRunId,
    type: "drive_sync",
  });
}

async function createConflict(
  admin: SupabaseAdmin,
  input: {
    conflictType: string;
    driveValue?: unknown;
    entityType: "file" | "folder" | "sync" | "template";
    googleDriveId?: string;
    localEntityId?: string;
    localValue?: unknown;
    syncRunId: string;
  },
) {
  const { error } = await admin.from("drive_sync_conflicts").insert({
    conflict_type: input.conflictType,
    drive_value: toJsonObject(input.driveValue),
    entity_type: input.entityType,
    google_drive_id: input.googleDriveId ?? null,
    local_entity_id: input.localEntityId ?? null,
    local_value: toJsonObject(input.localValue),
    status: "open",
    sync_run_id: input.syncRunId,
  });

  if (error && error.code !== "23505") {
    throw new Error(error.message);
  }
}

async function getLocalFolders(admin: SupabaseAdmin) {
  const { data, error } = await admin
    .from("folders")
    .select(
      "id,name,parent_folder_id,category_id,google_drive_folder_id,google_drive_parent_id,path,file_categories(name)",
    )
    .is("deleted_at", null);

  if (error) {
    throw new Error(error.message);
  }

  return (data ?? []).map(mapFolderRow);
}

async function getLocalFolderById(admin: SupabaseAdmin, folderId: string) {
  const { data, error } = await admin
    .from("folders")
    .select(
      "id,name,parent_folder_id,category_id,google_drive_folder_id,google_drive_parent_id,path,file_categories(name)",
    )
    .eq("id", folderId)
    .is("deleted_at", null)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return data ? mapFolderRow(data) : null;
}

async function getLocalFiles(admin: SupabaseAdmin) {
  const { data, error } = await admin
    .from("files")
    .select(
      "id,original_filename,file_type,file_size,storage_path,folder_id,category_id,source,google_drive_file_id,google_drive_parent_id,deleted_at",
    );

  if (error) {
    throw new Error(error.message);
  }

  return (data ?? []).map(mapFileRow);
}

async function getLocalFileById(admin: SupabaseAdmin, fileId: string) {
  const { data, error } = await admin
    .from("files")
    .select(
      "id,original_filename,file_type,file_size,storage_path,folder_id,category_id,source,google_drive_file_id,google_drive_parent_id,deleted_at",
    )
    .eq("id", fileId)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return data ? mapFileRow(data) : null;
}

function mapFolderRow(row: Record<string, unknown>): LocalFolder {
  return {
    categoryId: String(row.category_id ?? ""),
    categoryName: String(asRecord(row.file_categories).name ?? fallbackCategoryName),
    googleDriveFolderId: String(row.google_drive_folder_id ?? ""),
    googleDriveParentId: String(row.google_drive_parent_id ?? ""),
    id: String(row.id ?? ""),
    name: String(row.name ?? "Ordner"),
    parentFolderId: String(row.parent_folder_id ?? ""),
    path: String(row.path ?? row.name ?? ""),
  };
}

function mapFileRow(row: Record<string, unknown>): LocalFile {
  return {
    categoryId: String(row.category_id ?? ""),
    deletedAt: String(row.deleted_at ?? ""),
    fileSize: Number(row.file_size ?? 0),
    fileType: String(row.file_type ?? "application/octet-stream"),
    folderId: String(row.folder_id ?? ""),
    googleDriveFileId: String(row.google_drive_file_id ?? ""),
    googleDriveParentId: String(row.google_drive_parent_id ?? ""),
    id: String(row.id ?? ""),
    originalFilename: String(row.original_filename ?? "Datei"),
    source: String(row.source ?? "supabase"),
    storagePath: String(row.storage_path ?? ""),
  };
}

function buildFolderPath(folder: LocalFolder, foldersById: Map<string, LocalFolder>) {
  const names = [folder.name];
  let parent = folder.parentFolderId ? foldersById.get(folder.parentFolderId) : null;
  let guard = 0;

  while (parent && guard < 20) {
    names.unshift(parent.name);
    parent = parent.parentFolderId ? foldersById.get(parent.parentFolderId) : null;
    guard += 1;
  }

  return names.join("/");
}

function buildDrivePath(
  folder: DriveFile,
  driveFoldersById: Map<string, DriveFile>,
) {
  const names = [folder.name];
  let parentId = folder.parents[0] ?? "";
  let guard = 0;

  while (parentId && parentId !== getGoogleDriveRootFolderId() && guard < 20) {
    const parent = driveFoldersById.get(parentId);

    if (!parent) {
      break;
    }

    names.unshift(parent.name);
    parentId = parent.parents[0] ?? "";
    guard += 1;
  }

  return names.join("/");
}

function getTopLevelDriveFolderName(
  folder: DriveFile,
  driveFoldersById: Map<string, DriveFile>,
) {
  let current = folder;
  let parentId = current.parents[0] ?? "";
  let guard = 0;

  while (parentId && parentId !== getGoogleDriveRootFolderId() && guard < 20) {
    const parent = driveFoldersById.get(parentId);

    if (!parent) {
      break;
    }

    current = parent;
    parentId = current.parents[0] ?? "";
    guard += 1;
  }

  return current.name;
}

function normalizeName(value: string) {
  return value.trim().replace(/\s+/g, " ");
}

function sanitizeStorageName(value: string) {
  const clean = normalizeName(value)
    .replace(/[^A-Za-z0-9._-]+/g, "_")
    .replace(/^_+|_+$/g, "");

  return clean || "datei";
}

function getExtension(value: string) {
  const match = /\.([A-Za-z0-9]{1,12})$/.exec(value);

  return match?.[1]?.toLowerCase() ?? "";
}

function toJsonObject(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  return value as Record<string, unknown>;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}
