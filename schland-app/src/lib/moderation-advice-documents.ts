import {
  getDrivePreviewLink,
  getDriveWebViewLink,
  getGoogleDriveRootFolderId,
  getOfficialAdviceDocsFolderId,
  getOfficialAdviceDocsTemplateId,
  GoogleDriveClient,
  hasGoogleDriveServerConfig,
  isGoogleDocsMimeType,
  isOfficialAdviceDocsEnabled,
  type DriveFile,
} from "@/lib/google-drive";
import {
  type ModerationAdviceMeasure,
  type ModerationAdviceOutput,
  writeModerationAdviceLog,
} from "@/lib/moderation-advice";
import { getSupabaseAdminClient } from "@/lib/supabase/server";

type SupabaseAdminClient = ReturnType<typeof getSupabaseAdminClient>;

export type OfficialAdviceDocumentType =
  | "aktennotiz"
  | "ermittlungsvermerk"
  | "sanktionsvorschlag";

type OfficialAzAllocation = {
  az: string;
  period_month: number;
  period_year: number;
  sequence_number: number;
};

type OfficialFolderTarget = {
  categoryId: string | null;
  driveParentId: string;
  folderId: string | null;
  resolution: string;
};

const fallbackCategoryName = "Ungeordnet";
const reviewFolderName = "Zu pruefen";

const placeholders = [
  "AZ",
  "DATUM",
  "FALL_AZ",
  "TITEL",
  "ZIELPERSON",
  "ZIEL_DISCORD_ID",
  "VORFALL_ZEIT",
  "SACHVERHALT",
  "BEWEISWURDIGUNG",
  "RECHTSGRUNDLAGEN",
  "MASSNAHMEN",
  "EMPFEHLUNG_KURZ",
  "BEGRUENDUNG",
  "RISIKEN",
  "FEHLENDE_INFOS",
  "ERSTELLT_DURCH",
  "MODELL",
  "ANLAGEN",
] as const;

export function parseOfficialAdviceAz(value: string) {
  const match = value.match(
    /BRS\/ERM\/(\d{1,})\/(\d{1,2})\/(\d{4})\/?([A-Za-zÄÖÜäöüß]+)?/,
  );

  if (!match) {
    return null;
  }

  return {
    issuer: match[4] ?? "",
    periodMonth: Number(match[2]),
    periodYear: Number(match[3]),
    sequenceNumber: Number(match[1]),
  };
}

export function buildOfficialAdviceAz(input: {
  issuer?: string;
  periodMonth: number;
  periodYear: number;
  sequenceNumber: number;
}) {
  const issuer = (input.issuer || "KI").trim() || "KI";

  return [
    "BRS",
    "ERM",
    String(input.sequenceNumber).padStart(2, "0"),
    String(input.periodMonth).padStart(2, "0"),
    String(input.periodYear),
    issuer,
  ].join("/");
}

export async function createOfficialModerationAdviceDocument(input: {
  actorId: string;
  actorName: string;
  caseId: string;
  documentType?: OfficialAdviceDocumentType;
  folderId?: string;
  periodMonth?: number;
  periodYear?: number;
}) {
  if (!hasGoogleDriveServerConfig()) {
    throw new Error("google_drive_not_configured");
  }

  if (!isOfficialAdviceDocsEnabled()) {
    throw new Error("official_advice_docs_disabled");
  }

  const templateId = getOfficialAdviceDocsTemplateId();

  if (!templateId) {
    throw new Error("official_advice_template_missing");
  }

  const admin = getSupabaseAdminClient();
  const adviceCase = await loadAdviceCaseForDocument(admin, input.caseId);

  if (!adviceCase) {
    throw new Error("advice_case_missing");
  }

  const existing = await loadExistingOfficialDocument(admin, input.caseId);

  if (existing) {
    return existing;
  }

  const aiOutput = asObject(adviceCase.ai_output) as Partial<ModerationAdviceOutput>;

  if (!aiOutput.recommendedAction && !Array.isArray(aiOutput.recommendedMeasures)) {
    throw new Error("advice_document_needs_analysis");
  }

  const drive = new GoogleDriveClient();

  try {
    const allocation = await allocateOfficialAdviceAz(admin, {
      periodMonth: input.periodMonth,
      periodYear: input.periodYear,
    });
    const documentType =
      input.documentType || normalizeDocumentType(asText(asObject(aiOutput.officialDocument).documentType));
    const target = await resolveOfficialAdviceFolder(admin, drive, input.folderId);
    const payload = buildOfficialAdviceDocumentPayload({
      actorName: input.actorName,
      adviceCase,
      aiOutput: aiOutput as ModerationAdviceOutput,
      az: allocation.az,
      documentType,
    });
    const copy = await drive.copyFile({
      mimeType: "application/vnd.google-apps.document",
      name: payload.fileName,
      parentId: target.driveParentId,
      sourceFileId: templateId,
    });
    const fillResult = await fillOfficialAdviceGoogleDoc(drive, {
      documentId: copy.id,
      fallbackText: payload.fallbackText,
      values: payload.placeholders,
    });

    if (fillResult.fallbackAppended) {
      await writeModerationAdviceLog(admin, {
        action: "template_placeholders_missing",
        actorId: input.actorId,
        caseId: input.caseId,
        details: {
          occurrencesChanged: fillResult.occurrencesChanged,
          templateId,
        },
      });
    }

    const fileId = await registerOfficialAdviceFile(admin, {
      actorId: input.actorId,
      copy,
      description: payload.description,
      folderTarget: target,
      tags: ["google-docs", "ki-sanktionsberater", "offiziell", documentType],
      templateId,
    });
    const { data: officialDocument, error: documentError } = await admin
      .from("moderation_advice_official_documents")
      .insert({
        advice_case_id: input.caseId,
        az: allocation.az,
        created_by: input.actorId,
        document_type: documentType,
        file_id: fileId,
        google_drive_file_id: copy.id,
        issuer: "KI",
        metadata: {
          documentUrl: getDriveWebViewLink(copy.id, copy.mimeType),
          fallbackAppended: fillResult.fallbackAppended,
          folderResolution: target.resolution,
          placeholdersChanged: fillResult.occurrencesChanged,
          templateId,
        },
        period_month: allocation.period_month,
        period_year: allocation.period_year,
        sequence_number: allocation.sequence_number,
        status: "created",
      })
      .select("id")
      .single();

    if (documentError || !officialDocument?.id) {
      throw new Error(documentError?.message ?? "official_document_insert_failed");
    }

    await admin
      .from("moderation_advice_cases")
      .update({
        official_az: allocation.az,
        official_document_id: officialDocument.id,
      })
      .eq("id", input.caseId);

    await writeModerationAdviceLog(admin, {
      action: "offizielles_dokument_erstellt",
      actorId: input.actorId,
      caseId: input.caseId,
      details: {
        az: allocation.az,
        documentType,
        fileId,
        googleDriveFileId: copy.id,
        templateId,
      },
    });

    return {
      az: allocation.az,
      fileId,
      googleDriveFileId: copy.id,
      id: String(officialDocument.id),
      webViewLink: getDriveWebViewLink(copy.id, copy.mimeType),
    };
  } catch (error) {
    await writeModerationAdviceLog(admin, {
      action: "offizielles_dokument_fehler",
      actorId: input.actorId,
      caseId: input.caseId,
      details: {
        error: sanitizeFailureMessage(error),
      },
    });
    throw error;
  }
}

async function allocateOfficialAdviceAz(
  admin: SupabaseAdminClient,
  input: { periodMonth?: number; periodYear?: number },
) {
  const { data, error } = await admin.rpc("allocate_official_document_az", {
    p_document_kind: "BRS/ERM",
    p_issuer: "KI",
    p_period_month: input.periodMonth ?? null,
    p_period_year: input.periodYear ?? null,
  });
  const row = Array.isArray(data) ? data[0] : data;
  const record = asObject(row) as Partial<OfficialAzAllocation>;

  if (error || !record.az) {
    throw new Error(error?.message ?? "official_document_az_failed");
  }

  return {
    az: String(record.az),
    period_month: Number(record.period_month),
    period_year: Number(record.period_year),
    sequence_number: Number(record.sequence_number),
  };
}

async function fillOfficialAdviceGoogleDoc(
  drive: GoogleDriveClient,
  input: {
    documentId: string;
    fallbackText: string;
    values: Record<(typeof placeholders)[number], string>;
  },
) {
  const replaceRequests = placeholders.map((placeholder) => ({
    replaceAllText: {
      containsText: {
        matchCase: true,
        text: `{{${placeholder}}}`,
      },
      replaceText: input.values[placeholder] || "-",
    },
  }));
  const replaceResponse = await drive.batchUpdateDocument({
    documentId: input.documentId,
    requests: replaceRequests,
  });
  const occurrencesChanged = sumReplaceOccurrences(replaceResponse);
  const fallbackAppended = occurrencesChanged < placeholders.length;

  if (fallbackAppended) {
    const document = await drive.getDocument(input.documentId);
    const endIndex = getDocumentEndIndex(document);

    await drive.batchUpdateDocument({
      documentId: input.documentId,
      requests: [
        {
          insertText: {
            location: {
              index: Math.max(1, endIndex - 1),
            },
            text: `\n\n${input.fallbackText}`,
          },
        },
      ],
    });
  }

  return {
    fallbackAppended,
    occurrencesChanged,
  };
}

function buildOfficialAdviceDocumentPayload(input: {
  actorName: string;
  adviceCase: Record<string, unknown>;
  aiOutput: ModerationAdviceOutput;
  az: string;
  documentType: OfficialAdviceDocumentType;
}) {
  const targetMember = asObject(input.adviceCase.target_member);
  const title =
    asText(input.aiOutput.officialDocument?.title) ||
    asText(input.adviceCase.title) ||
    "KI-Ermittlungsvermerk";
  const targetName =
    asText(targetMember.name) ||
    asText(targetMember.discord_display_name) ||
    asText(input.adviceCase.target_discord_username) ||
    "Unbekannte Zielperson";
  const targetDiscordId =
    asText(targetMember.discord_id) ||
    asText(input.adviceCase.target_discord_user_id) ||
    "-";
  const measuresText = buildMeasuresText(input.aiOutput.recommendedMeasures ?? []);
  const evidenceText = buildEvidenceText(input.adviceCase);
  const legalText = buildLegalText(input.aiOutput);
  const risksText = [
    ...toStringArray(input.aiOutput.riskFlags),
    ...toStringArray(input.aiOutput.evidenceAssessment?.ignoredOrUnreadableEvidence),
  ].join("\n") || "-";
  const missingInfoText =
    toStringArray(input.aiOutput.missingInformation).join("\n") || "-";
  const now = new Date();
  const placeholdersMap: Record<(typeof placeholders)[number], string> = {
    ANLAGEN: evidenceText,
    AZ: input.az,
    BEGRUENDUNG:
      input.aiOutput.humanExplanation ||
      input.aiOutput.decisionSummary ||
      "Keine Begruendung vorhanden.",
    BEWEISWURDIGUNG: buildEvidenceAssessmentText(input.aiOutput),
    DATUM: formatDateTime(now.toISOString()),
    ERSTELLT_DURCH: input.actorName,
    FALL_AZ: asText(input.adviceCase.case_number) || "-",
    FEHLENDE_INFOS: missingInfoText,
    MASSNAHMEN: measuresText,
    MODELL: [
      asText(input.adviceCase.model_provider),
      asText(input.adviceCase.model_name),
    ].filter(Boolean).join(" / ") || "-",
    RECHTSGRUNDLAGEN: legalText,
    RISIKEN: risksText,
    SACHVERHALT: buildFactsText(input.adviceCase),
    TITEL: title,
    VORFALL_ZEIT: formatDateTime(asText(input.adviceCase.incident_at)),
    ZIELPERSON: targetName,
    ZIEL_DISCORD_ID: targetDiscordId,
    EMPFEHLUNG_KURZ:
      input.aiOutput.decisionSummary ||
      `Technische Empfehlung: ${input.aiOutput.recommendedAction}`,
  };
  const fallbackText = [
    `Aktenzeichen: ${input.az}`,
    `Interner Fall: ${asText(input.adviceCase.case_number) || "-"}`,
    "",
    title,
    "",
    "Sachverhalt",
    placeholdersMap.SACHVERHALT,
    "",
    "Beweiswuerdigung",
    placeholdersMap.BEWEISWURDIGUNG,
    "",
    "Rechtsgrundlagen",
    legalText,
    "",
    "Massnahmenempfehlungen",
    measuresText,
    "",
    "Risiken und fehlende Informationen",
    [risksText, missingInfoText].filter(Boolean).join("\n"),
    "",
    "Hinweis: Dieses Dokument ist eine KI-gestuetzte Empfehlung und wird erst durch berechtigte menschliche Entscheidung verbindlich.",
  ].join("\n");

  return {
    description: `Offizielles KI-Dokument ${input.az} zum Beratungsfall ${asText(
      input.adviceCase.case_number,
    )}.`,
    fallbackText,
    fileName: `Az. ${input.az} - ${title}`.slice(0, 180),
    placeholders: placeholdersMap,
  };
}

function buildFactsText(adviceCase: Record<string, unknown>) {
  return [
    `Titel: ${asText(adviceCase.title) || "-"}`,
    `Situation: ${asText(adviceCase.situation_text) || "-"}`,
    `Konkretes Verhalten: ${asText(adviceCase.behavior_summary) || "-"}`,
    `Betroffene Personen: ${asText(adviceCase.affected_people) || "-"}`,
    `Gewuenschter Ausgang: ${asText(adviceCase.desired_outcome) || "-"}`,
    `Interne Notizen: ${asText(adviceCase.internal_notes) || "-"}`,
  ].join("\n");
}

function buildEvidenceAssessmentText(output: ModerationAdviceOutput) {
  const assessment = output.evidenceAssessment;

  return [
    `Entscheidung ausreichend belegt: ${
      assessment?.completeEnoughForDecision ? "Ja" : "Nein"
    }`,
    `Staerkste Belege: ${toStringArray(assessment?.strongestEvidence).join("; ") || "-"}`,
    `Schwaechste Belege: ${toStringArray(assessment?.weakestEvidence).join("; ") || "-"}`,
    `Widersprueche: ${toStringArray(assessment?.contradictions).join("; ") || "-"}`,
    `Nicht gelesene/ignorierte Belege: ${
      toStringArray(assessment?.ignoredOrUnreadableEvidence).join("; ") || "-"
    }`,
  ].join("\n");
}

function buildLegalText(output: ModerationAdviceOutput) {
  const legalBasis = output.legalBasis ?? [];
  const measureLegalBasis = (output.recommendedMeasures ?? []).flatMap(
    (measure) => measure.legalBasis,
  );
  const lines = [...legalBasis, ...measureLegalBasis]
    .map((basis) =>
      `${basis.source} ${basis.section}: ${basis.reason}`.trim(),
    )
    .filter(Boolean);

  return [...new Set(lines)].join("\n") || "-";
}

function buildMeasuresText(measures: ModerationAdviceMeasure[]) {
  const sorted = [...measures].sort(
    (left, right) => left.recommendedOrder - right.recommendedOrder,
  );

  return (
    sorted
      .map((measure, index) =>
        [
          `${index + 1}. ${measure.title}`,
          `Art: ${measure.measureType}`,
          `Beschreibung: ${measure.description || "-"}`,
          `Begruendung: ${measure.whyAppropriate || "-"}`,
          `Belege: ${measure.evidenceBasis.join("; ") || "-"}`,
          `Rechtsgrundlagen: ${
            measure.legalBasis
              .map((basis) => `${basis.source} ${basis.section}`)
              .join("; ") || "-"
          }`,
          `Risiken: ${measure.riskFlags.join("; ") || "-"}`,
          `Ausfuehrbar: ${measure.executable ? "Ja, nach Admin-Klick" : "Nein"}`,
          `Vertrauen: ${Math.round(measure.confidence * 100)}%`,
        ].join("\n"),
      )
      .join("\n\n") || "-"
  );
}

function buildEvidenceText(adviceCase: Record<string, unknown>) {
  const evidenceRows = toRecordArray(adviceCase.moderation_advice_evidence);
  const evidenceSummary = asObject(adviceCase.evidence_summary);
  const manifest = asObject(evidenceSummary.manifest);
  const manifestItems = toRecordArray(manifest.items);
  const evidenceLines = evidenceRows.map((evidence, index) =>
    [
      `${index + 1}. ${asText(evidence.label) || "Beleg"}`,
      `Typ: ${asText(evidence.evidence_type) || "-"}`,
      `Beschreibung: ${asText(evidence.description) || "-"}`,
      `Link: ${asText(evidence.external_url) || "-"}`,
    ].join("\n"),
  );
  const manifestLines = manifestItems.map((item) =>
    [
      `Manifest ${asText(item.evidenceId) || "-"}`,
      `Lesbar: ${item.readable === true ? "Ja" : "Nein"}`,
      `Modus: ${asText(item.textIncludedMode) || "-"}`,
      `Risiko: ${asText(item.riskNote) || "-"}`,
    ].join(" | "),
  );

  return [...evidenceLines, ...manifestLines].join("\n\n") || "-";
}

async function registerOfficialAdviceFile(
  admin: SupabaseAdminClient,
  input: {
    actorId: string;
    copy: DriveFile;
    description: string;
    folderTarget: OfficialFolderTarget;
    tags: string[];
    templateId: string;
  },
) {
  const mimeType = input.copy.mimeType || "application/vnd.google-apps.document";
  const isGoogleDoc = isGoogleDocsMimeType(mimeType);
  const webViewLink = input.copy.webViewLink || getDriveWebViewLink(input.copy.id, mimeType);
  const previewLink = getDrivePreviewLink(input.copy.id, mimeType);
  const { data, error } = await admin
    .from("files")
    .insert({
      category_id: input.folderTarget.categoryId,
      description: input.description,
      extension: isGoogleDoc ? "gdoc" : getExtension(input.copy.name),
      external_url: webViewLink,
      file_size: Number(input.copy.size ?? 0),
      file_type: mimeType,
      filename: isGoogleDoc
        ? `${sanitizeStorageName(input.copy.name)}.gdoc`
        : sanitizeStorageName(input.copy.name),
      folder_id: input.folderTarget.folderId,
      google_drive_file_id: input.copy.id,
      google_drive_parent_id: input.folderTarget.driveParentId,
      google_drive_preview_link: previewLink,
      google_drive_web_view_link: webViewLink,
      is_google_doc: isGoogleDoc,
      is_template_copy: true,
      last_synced_at: new Date().toISOString(),
      original_filename: input.copy.name,
      source: "official_advice_document",
      source_id: input.copy.id,
      source_mime_type: mimeType,
      storage_path: `google-drive/${input.copy.id}`,
      sync_status: "synced",
      tags: input.tags,
      template_source_id: input.templateId,
      uploaded_by: input.actorId,
    })
    .select("id")
    .single();

  if (error || !data?.id) {
    throw new Error(error?.message ?? "official_document_file_insert_failed");
  }

  await admin.from("systemprotokoll").insert({
    aktion: "official_advice_doc_created",
    benutzer_id: input.actorId,
    bereich: "moderation_advice",
    details: `file=${String(data.id)}; drive=${input.copy.id}`,
  });

  return String(data.id);
}

async function resolveOfficialAdviceFolder(
  admin: SupabaseAdminClient,
  drive: GoogleDriveClient,
  folderId?: string,
): Promise<OfficialFolderTarget> {
  if (folderId) {
    const folder = await getLocalFolderById(admin, folderId);

    if (!folder) {
      throw new Error("official_document_folder_missing");
    }

    return {
      categoryId: folder.categoryId,
      driveParentId: await ensureDriveFolder(admin, drive, folder),
      folderId: folder.id,
      resolution: "explicit_local_folder",
    };
  }

  const configuredDriveFolderId = getOfficialAdviceDocsFolderId();

  if (configuredDriveFolderId) {
    return {
      categoryId: await ensureCategory(admin, fallbackCategoryName),
      driveParentId: configuredDriveFolderId,
      folderId: null,
      resolution: "env_google_drive_folder",
    };
  }

  const reviewFolder = await ensureReviewFolder(admin);

  return {
    categoryId: reviewFolder.categoryId,
    driveParentId: await ensureDriveFolder(admin, drive, reviewFolder),
    folderId: reviewFolder.id,
    resolution: "fallback_zu_pruefen",
  };
}

async function ensureDriveFolder(
  admin: SupabaseAdminClient,
  drive: GoogleDriveClient,
  folder: LocalFolder,
): Promise<string> {
  if (folder.googleDriveFolderId) {
    return folder.googleDriveFolderId;
  }

  const parent = folder.parentFolderId
    ? await getLocalFolderById(admin, folder.parentFolderId)
    : null;
  const parentDriveId = parent
    ? await ensureDriveFolder(admin, drive, parent)
    : getGoogleDriveRootFolderId();
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

type LocalFolder = {
  categoryId: string;
  googleDriveFolderId: string;
  id: string;
  name: string;
  parentFolderId: string;
};

async function getLocalFolderById(
  admin: SupabaseAdminClient,
  folderId: string,
): Promise<LocalFolder | null> {
  const { data, error } = await admin
    .from("folders")
    .select("id,name,parent_folder_id,category_id,google_drive_folder_id")
    .eq("id", folderId)
    .is("deleted_at", null)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return data ? mapFolderRow(data) : null;
}

async function ensureReviewFolder(admin: SupabaseAdminClient) {
  const categoryId = await ensureCategory(admin, fallbackCategoryName);
  const { data: existing, error: existingError } = await admin
    .from("folders")
    .select("id,name,parent_folder_id,category_id,google_drive_folder_id")
    .eq("category_id", categoryId)
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
      category_id: categoryId,
      name: reviewFolderName,
      path: reviewFolderName,
      sync_status: "needs_review",
    })
    .select("id,name,parent_folder_id,category_id,google_drive_folder_id")
    .single();

  if (error || !data?.id) {
    throw new Error(error?.message ?? "review_folder_insert_failed");
  }

  return mapFolderRow(data);
}

async function ensureCategory(admin: SupabaseAdminClient, name: string) {
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
      description: "Automatisch fuer offizielle KI-Dokumente angelegt.",
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

function mapFolderRow(row: Record<string, unknown>): LocalFolder {
  return {
    categoryId: String(row.category_id ?? ""),
    googleDriveFolderId: String(row.google_drive_folder_id ?? ""),
    id: String(row.id ?? ""),
    name: String(row.name ?? reviewFolderName),
    parentFolderId: String(row.parent_folder_id ?? ""),
  };
}

async function loadAdviceCaseForDocument(
  admin: SupabaseAdminClient,
  caseId: string,
) {
  const { data, error } = await admin
    .from("moderation_advice_cases")
    .select(
      `
        *,
        target_member:members!moderation_advice_cases_target_member_id_fkey(
          id,
          name,
          discord_id,
          discord_username,
          discord_display_name
        ),
        moderation_advice_evidence(
          id,
          evidence_type,
          label,
          description,
          external_url,
          metadata,
          created_at,
          files(
            id,
            filename,
            original_filename,
            file_type,
            file_size,
            google_drive_file_id,
            google_drive_web_view_link
          )
        ),
        moderation_advice_logs(
          id,
          action,
          details,
          created_at
        )
      `,
    )
    .eq("id", caseId)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return data ? asObject(data) : null;
}

async function loadExistingOfficialDocument(
  admin: SupabaseAdminClient,
  caseId: string,
) {
  const { data, error } = await admin
    .from("moderation_advice_official_documents")
    .select("id,az,file_id,google_drive_file_id,metadata,files(google_drive_web_view_link,external_url)")
    .eq("advice_case_id", caseId)
    .eq("status", "created")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    return null;
  }

  if (!data?.id) {
    return null;
  }

  const file = asObject(data.files);

  return {
    az: String(data.az ?? ""),
    fileId: String(data.file_id ?? ""),
    googleDriveFileId: String(data.google_drive_file_id ?? ""),
    id: String(data.id),
    webViewLink:
      String(file.google_drive_web_view_link ?? file.external_url ?? "") ||
      String(asObject(data.metadata).documentUrl ?? ""),
  };
}

function sumReplaceOccurrences(value: Record<string, unknown>) {
  return toRecordArray(value.replies).reduce((total, reply) => {
    const replaceAllText = asObject(reply.replaceAllText);
    const occurrencesChanged = Number(replaceAllText.occurrencesChanged ?? 0);

    return total + (Number.isFinite(occurrencesChanged) ? occurrencesChanged : 0);
  }, 0);
}

function getDocumentEndIndex(document: Record<string, unknown>) {
  const body = asObject(document.body);
  const content = toRecordArray(body.content);
  const endIndexes = content
    .map((entry) => Number(entry.endIndex ?? 0))
    .filter((value) => Number.isFinite(value) && value > 0);

  return Math.max(1, ...endIndexes);
}

function normalizeDocumentType(value: string): OfficialAdviceDocumentType {
  if (value === "sanktionsvorschlag" || value === "aktennotiz") {
    return value;
  }

  return "ermittlungsvermerk";
}

function formatDateTime(value: string) {
  if (!value) {
    return "-";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("de-DE", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: "Europe/Berlin",
  }).format(date);
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

function sanitizeFailureMessage(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);

  return message
    .slice(0, 500)
    .replace(/sk-[A-Za-z0-9_-]{12,}/g, "[redacted-api-key]")
    .replace(/Bearer\s+[A-Za-z0-9._~-]+/gi, "Bearer [redacted]");
}

function toStringArray(value: unknown) {
  return Array.isArray(value)
    ? value.map((entry) => String(entry ?? "").trim()).filter(Boolean)
    : [];
}

function toRecordArray(value: unknown) {
  return Array.isArray(value)
    ? value.map(asObject).filter((entry) => Object.keys(entry).length > 0)
    : [];
}

function asObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function asText(value: unknown) {
  return String(value ?? "").trim();
}
