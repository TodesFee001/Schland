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

type SupabaseAdminClient = ReturnType<typeof getSupabaseAdminClient>;

const DISCORD_ID_PATTERN = /^\d{17,22}$/;
const EXCLUDED_DISCORD_IDS = new Set([
  "531491018659332166",
  "367015528709095434",
  "262579804975398923",
]);
const FIELD_NAME = "discord_intake_questionnaire";
const FORM_VERSION = 2;
const NEW_MEMBER_DELAY_MS = 3 * 60 * 60 * 1000;
const PENDING_BATCH_LIMIT = 5;
const SENDING_RETRY_MS = 30 * 60 * 1000;
const TEST_DISCORD_IDS = new Set(readList(process.env.QUESTIONNAIRE_TEST_DISCORD_IDS));
const FORCE_RESEND_DISCORD_IDS = new Set(
  readList(process.env.QUESTIONNAIRE_FORCE_RESEND_DISCORD_IDS),
);
const FORCE_RESEND_RUN_ID = asText(process.env.QUESTIONNAIRE_FORCE_RESEND_RUN_ID);
const BULK_ROLLOUT_ENABLED =
  process.env.QUESTIONNAIRE_BULK_ROLLOUT_ENABLED?.trim().toLowerCase() ===
  "true";
const WRITE_STATUSES = new Set([
  "failed",
  "gaming_submitted",
  "profile_submitted",
  "sending",
  "sent",
  "skipped",
  "socials_submitted",
  "submitted",
]);

type IntakeAnswers = {
  age: number | null;
  ea: string;
  instagram: string;
  name: string;
  notes: string;
  profession: string;
  residence: string;
  snapchat: string;
  stream: string;
  tiktok: string;
  ubisoft: string;
};

export async function GET(request: Request) {
  const authError = getDiscordBotAuthError(request);

  if (authError) {
    return authError;
  }

  const supabase = getSupabaseAdminClient();
  const [membersResult, logsResult] = await Promise.all([
    supabase
      .from("members")
      .select(
        `
          id,
          name,
          discord_id,
          discord_username,
          discord_display_name,
          discord_joined_at,
          discord_on_server,
          discord_is_bot
        `,
      )
      .eq("discord_on_server", true)
      .eq("discord_is_bot", false)
      .not("discord_id", "is", null)
      .order("discord_joined_at", { ascending: true, nullsFirst: true })
      .limit(1000),
    supabase
      .from("member_case_logs")
      .select("id, member_id, created_at, new_value, success")
      .eq("field_name", FIELD_NAME)
      .order("created_at", { ascending: false })
      .limit(5000),
  ]);

  if (membersResult.error) {
    console.error("discord questionnaire member lookup failed", {
      code: membersResult.error.code,
      details: membersResult.error.details,
      message: membersResult.error.message,
    });

    return NextResponse.json(
      { error: "questionnaire_member_lookup_failed" },
      { status: 500 },
    );
  }

  if (logsResult.error) {
    console.error("discord questionnaire log lookup failed", {
      code: logsResult.error.code,
      details: logsResult.error.details,
      message: logsResult.error.message,
    });

    return NextResponse.json(
      { error: "questionnaire_log_lookup_failed" },
      { status: 500 },
    );
  }

  const latestLogs = mapLatestLogsByMember(logsResult.data ?? []);
  const rolloutLimitedToTestUsers =
    !BULK_ROLLOUT_ENABLED && TEST_DISCORD_IDS.size > 0;
  const rolloutPaused = !BULK_ROLLOUT_ENABLED && TEST_DISCORD_IDS.size === 0;
  const now = Date.now();
  const memberRecords = (membersResult.data ?? []).map(asRecord);
  const pending = rolloutPaused
    ? []
    : memberRecords
        .filter((member) =>
          isQuestionnaireDue(member, latestLogs, now, {
            limitedToTestUsers: rolloutLimitedToTestUsers,
          }),
        )
        .map((member) => {
          const discordId = asText(member.discord_id) ?? "";
          const username = asText(member.discord_username);
          const displayName = asText(member.discord_display_name);

          return {
            discordDisplayName: displayName,
            discordUserId: discordId,
            discordUsername: username,
            id: asText(member.id),
            joinedAt: asIsoDate(member.discord_joined_at),
            memberId: asText(member.id),
            name: asText(member.name) ?? displayName ?? username ?? discordId,
          };
        })
        .filter((entry) => entry.memberId && entry.discordUserId);
  const rollout = rolloutPaused
    ? "paused"
    : rolloutLimitedToTestUsers
      ? "test"
      : "bulk";

  if (rollout !== "bulk") {
    console.info("discord questionnaire rollout", {
      queueSize: pending.length,
      rollout,
      testIdsConfigured: TEST_DISCORD_IDS.size,
      testMembersMatched: memberRecords.filter((member) => {
        const discordId = asText(member.discord_id);

        return discordId ? TEST_DISCORD_IDS.has(discordId) : false;
      }).length,
      totalMembersConsidered: memberRecords.length,
    });
  }

  return NextResponse.json({
    questionnaires: pending.slice(0, PENDING_BATCH_LIMIT),
    queueSize: pending.length,
    rollout,
  });
}

export async function PATCH(request: Request) {
  const authError = getDiscordBotAuthError(request);

  if (authError) {
    return authError;
  }

  const body = await readJsonObject(request);
  const memberId = asText(body?.memberId ?? body?.member_id ?? body?.id);
  const status = asText(body?.status);
  const discordUserId = asText(
    body?.discordUserId ?? body?.discord_user_id ?? body?.userId,
  );

  if (!memberId || !isUuid(memberId)) {
    return NextResponse.json({ error: "member_id_required" }, { status: 400 });
  }

  if (!status || !WRITE_STATUSES.has(status)) {
    return NextResponse.json({ error: "status_invalid" }, { status: 400 });
  }

  if (discordUserId && !DISCORD_ID_PATTERN.test(discordUserId)) {
    return NextResponse.json(
      { error: "discord_user_id_invalid" },
      { status: 400 },
    );
  }

  const supabase = getSupabaseAdminClient();
  const { data: member, error: lookupError } = await supabase
    .from("members")
    .select(
      `
        id,
        name,
        age,
        residence,
        profession,
        notes,
        instagram,
        snapchat,
        tiktok,
        stream,
        ubisoft,
        ea,
        discord_id,
        discord_username,
        discord_display_name
      `,
    )
    .eq("id", memberId)
    .maybeSingle();

  if (lookupError) {
    console.error("discord questionnaire member fetch failed", {
      code: lookupError.code,
      details: lookupError.details,
      message: lookupError.message,
    });

    return NextResponse.json(
      { error: "questionnaire_member_lookup_failed" },
      { status: 500 },
    );
  }

  if (!member) {
    return NextResponse.json({ error: "member_not_found" }, { status: 404 });
  }

  const memberRecord = asRecord(member);
  const memberDiscordId = asText(memberRecord.discord_id);

  if (discordUserId && memberDiscordId && discordUserId !== memberDiscordId) {
    return NextResponse.json(
      { error: "discord_user_id_mismatch" },
      { status: 403 },
    );
  }

  if (isSubmissionStatus(status)) {
    return submitQuestionnaire(supabase, memberId, memberRecord, body, status);
  }

  const logError = await insertQuestionnaireLog(supabase, {
    botError: asText(body?.botError ?? body?.error),
    discordUserId,
    dmMessageId: asText(body?.dmMessageId ?? body?.messageId),
    memberId,
    reason: mapStatusReason(status),
    status,
    success: status !== "failed",
  });

  if (logError) {
    return logError;
  }

  return NextResponse.json({ questionnaire: { memberId, status } });
}

async function submitQuestionnaire(
  supabase: SupabaseAdminClient,
  memberId: string,
  member: Record<string, unknown>,
  body: Record<string, unknown> | null,
  status: string,
) {
  const answers = normalizeAnswers(body?.answers);
  const discordUserId = asText(
    body?.discordUserId ?? body?.discord_user_id ?? body?.userId,
  );

  if ((status === "profile_submitted" || status === "submitted") && !answers.name) {
    return NextResponse.json({ error: "name_required" }, { status: 400 });
  }

  const oldValues = {
    age: asInteger(member.age),
    ea: asText(member.ea),
    instagram: asText(member.instagram),
    name: asText(member.name),
    notes: asText(member.notes),
    profession: asText(member.profession),
    residence: asText(member.residence),
    snapchat: asText(member.snapchat),
    stream: asText(member.stream),
    tiktok: asText(member.tiktok),
    ubisoft: asText(member.ubisoft),
  };
  const update: Record<string, unknown> = {
    status: "review",
    updated_at: new Date().toISOString(),
  };

  if (answers.name) {
    update.name = answers.name;
  }

  if (status !== "gaming_submitted" && status !== "socials_submitted" && answers.age !== null) {
    update.age = answers.age;
  }

  if (answers.residence) {
    update.residence = answers.residence;
  }

  if (answers.profession) {
    update.profession = answers.profession;
  }

  if (answers.instagram) {
    update.instagram = answers.instagram;
  }

  if (answers.snapchat) {
    update.snapchat = answers.snapchat;
  }

  if (answers.tiktok) {
    update.tiktok = answers.tiktok;
  }

  if (answers.stream) {
    update.stream = answers.stream;
  }

  if (answers.ubisoft) {
    update.ubisoft = answers.ubisoft;
  }

  if (answers.ea) {
    update.ea = answers.ea;
  }

  if (answers.notes) {
    update.notes = mergeIntakeNotes(asText(member.notes) ?? "", answers.notes);
  }

  const { error: updateError } = await supabase
    .from("members")
    .update(update)
    .eq("id", memberId);

  if (updateError) {
    console.error("discord questionnaire member update failed", {
      code: updateError.code,
      details: updateError.details,
      message: updateError.message,
    });

    return NextResponse.json(
      { error: "questionnaire_member_update_failed" },
      { status: 500 },
    );
  }

  const logError = await insertQuestionnaireLog(supabase, {
    answers,
    discordUserId,
    memberId,
    oldValues,
    reason: mapStatusReason(status),
    status,
    success: true,
  });

  if (logError) {
    return logError;
  }

  return NextResponse.json({ questionnaire: { memberId, status } });
}

async function insertQuestionnaireLog(
  supabase: SupabaseAdminClient,
  input: {
    answers?: IntakeAnswers;
    botError?: string | null;
    discordUserId?: string | null;
    dmMessageId?: string | null;
    memberId: string;
    oldValues?: Record<string, unknown>;
    reason: string;
    status: string;
    success: boolean;
  },
) {
  const payload = {
    answers: input.answers,
    botError: input.botError,
    discordUserId: input.discordUserId,
    dmMessageId: input.dmMessageId,
    forceResendRunId: FORCE_RESEND_RUN_ID,
    formVersion: FORM_VERSION,
    status: input.status,
  };
  const { error } = await supabase.from("member_case_logs").insert({
    action: "edit",
    field_name: FIELD_NAME,
    member_id: input.memberId,
    new_value: JSON.stringify(payload),
    old_value: input.oldValues ? JSON.stringify(input.oldValues) : null,
    reason: input.reason,
    success: input.success,
    username: "Discord Bot",
  });

  if (!error) {
    return null;
  }

  console.error("discord questionnaire log insert failed", {
    code: error.code,
    details: error.details,
    message: error.message,
  });

  return NextResponse.json(
    { error: "questionnaire_log_insert_failed" },
    { status: 500 },
  );
}

function isQuestionnaireDue(
  member: Record<string, unknown>,
  latestLogs: Map<string, Record<string, unknown>>,
  now: number,
  options: { limitedToTestUsers: boolean },
) {
  const memberId = asText(member.id);
  const discordId = asText(member.discord_id);

  if (!memberId || !discordId || !DISCORD_ID_PATTERN.test(discordId)) {
    return false;
  }

  if (EXCLUDED_DISCORD_IDS.has(discordId)) {
    return false;
  }

  if (options.limitedToTestUsers && !TEST_DISCORD_IDS.has(discordId)) {
    return false;
  }

  if (member.discord_on_server === false || member.discord_is_bot === true) {
    return false;
  }

  const latestLog = latestLogs.get(memberId);

  if (latestLog) {
    const payload = parseJsonRecord(latestLog.new_value);
    const status = asText(payload.status);
    const forceResendAllowed =
      options.limitedToTestUsers &&
      Boolean(FORCE_RESEND_RUN_ID) &&
      (FORCE_RESEND_DISCORD_IDS.size === 0 ||
        FORCE_RESEND_DISCORD_IDS.has(discordId));

    if (
      forceResendAllowed &&
      asText(payload.forceResendRunId) !== FORCE_RESEND_RUN_ID
    ) {
      return true;
    }

    if (status === "sending") {
      const createdAt = Date.parse(asIsoDate(latestLog.created_at) ?? "");

      return Number.isFinite(createdAt) && now - createdAt > SENDING_RETRY_MS;
    }

    if (isOutdatedQuestionnairePayload(payload)) {
      return true;
    }

    return false;
  }

  const joinedAt = asIsoDate(member.discord_joined_at);

  if (!joinedAt) {
    return true;
  }

  return now - Date.parse(joinedAt) >= NEW_MEMBER_DELAY_MS;
}

function mapLatestLogsByMember(rows: unknown[]) {
  const latestLogs = new Map<string, Record<string, unknown>>();

  for (const row of rows) {
    const record = asRecord(row);
    const memberId = asText(record.member_id);

    if (memberId && !latestLogs.has(memberId)) {
      latestLogs.set(memberId, record);
    }
  }

  return latestLogs;
}

function mapStatusReason(status: string) {
  const labels: Record<string, string> = {
    failed: "Discord-Aktenbogen DM fehlgeschlagen",
    gaming_submitted: "Discord-Aktenbogen Gaming-Felder eingereicht",
    profile_submitted: "Discord-Aktenbogen Basisfelder eingereicht",
    sending: "Discord-Aktenbogen wird gesendet",
    sent: "Discord-Aktenbogen DM gesendet",
    skipped: "Discord-Aktenbogen uebersprungen",
    socials_submitted: "Discord-Aktenbogen Social-Felder eingereicht",
    submitted: "Discord-Aktenbogen eingereicht - Pruefung offen",
  };

  return labels[status] ?? "Discord-Aktenbogen aktualisiert";
}

function isSubmissionStatus(status: string) {
  return (
    status === "gaming_submitted" ||
    status === "profile_submitted" ||
    status === "socials_submitted" ||
    status === "submitted"
  );
}

function isOutdatedQuestionnairePayload(payload: Record<string, unknown>) {
  const formVersion = asInteger(payload.formVersion) ?? 1;

  return formVersion < FORM_VERSION;
}

function normalizeAnswers(value: unknown): IntakeAnswers {
  const record = asRecord(value);
  const age = asInteger(record.age);

  return {
    age: age === null ? null : Math.min(Math.max(age, 0), 120),
    ea: trimText(record.ea, 120),
    instagram: trimText(record.instagram, 120),
    name: trimText(record.name ?? record.recordName, 120),
    notes: trimText(record.notes ?? record.otherInfo, 1200),
    profession: trimText(record.profession, 120),
    residence: trimText(record.residence, 120),
    snapchat: trimText(record.snapchat, 120),
    stream: trimText(record.stream, 120),
    tiktok: trimText(record.tiktok, 120),
    ubisoft: trimText(record.ubisoft, 120),
  };
}

function mergeIntakeNotes(currentNotes: string, otherInfo: string) {
  const block = [
    `Discord-Aktenbogen (${new Date().toISOString()}):`,
    otherInfo,
  ].join("\n");

  return [currentNotes, block].filter(Boolean).join("\n\n");
}

function parseJsonRecord(value: unknown) {
  const text = asText(value);

  if (!text) {
    return {};
  }

  try {
    return asRecord(JSON.parse(text));
  } catch {
    return {};
  }
}

function trimText(value: unknown, maxLength: number) {
  return String(value ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);
}

function readList(value: unknown) {
  return String(value ?? "")
    .split(/[\n,;]+/)
    .map((entry) => entry.trim())
    .filter(Boolean);
}
