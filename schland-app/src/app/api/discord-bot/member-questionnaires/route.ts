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
const NEW_MEMBER_DELAY_MS = 3 * 60 * 60 * 1000;
const PENDING_BATCH_LIMIT = 5;
const SENDING_RETRY_MS = 30 * 60 * 1000;
const TEST_DISCORD_IDS = new Set(readList(process.env.QUESTIONNAIRE_TEST_DISCORD_IDS));
const BULK_ROLLOUT_ENABLED =
  process.env.QUESTIONNAIRE_BULK_ROLLOUT_ENABLED?.trim().toLowerCase() ===
  "true";
const WRITE_STATUSES = new Set([
  "failed",
  "sending",
  "sent",
  "skipped",
  "submitted",
]);

type IntakeAnswers = {
  age: number | null;
  name: string;
  otherInfo: string;
  profession: string;
  residence: string;
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
  const pending = rolloutPaused
    ? []
    : (membersResult.data ?? [])
    .map(asRecord)
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

  return NextResponse.json({
    questionnaires: pending.slice(0, PENDING_BATCH_LIMIT),
    queueSize: pending.length,
    rollout: rolloutPaused
      ? "paused"
      : rolloutLimitedToTestUsers
        ? "test"
        : "bulk",
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

  if (status === "submitted") {
    return submitQuestionnaire(supabase, memberId, memberRecord, body);
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
) {
  const answers = normalizeAnswers(body?.answers);
  const discordUserId = asText(
    body?.discordUserId ?? body?.discord_user_id ?? body?.userId,
  );

  if (!answers.name || answers.name.length < 2) {
    return NextResponse.json({ error: "name_required" }, { status: 400 });
  }

  const oldValues = {
    age: asInteger(member.age),
    name: asText(member.name),
    notes: asText(member.notes),
    profession: asText(member.profession),
    residence: asText(member.residence),
  };
  const update: Record<string, unknown> = {
    name: answers.name,
    status: "review",
    updated_at: new Date().toISOString(),
  };

  if (answers.age !== null) {
    update.age = answers.age;
  }

  if (answers.residence) {
    update.residence = answers.residence;
  }

  if (answers.profession) {
    update.profession = answers.profession;
  }

  if (answers.otherInfo) {
    update.notes = mergeIntakeNotes(asText(member.notes) ?? "", answers.otherInfo);
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
    reason: "Discord-Aktenbogen eingereicht - Pruefung offen",
    status: "submitted",
    success: true,
  });

  if (logError) {
    return logError;
  }

  return NextResponse.json({ questionnaire: { memberId, status: "submitted" } });
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

    if (status === "sending") {
      const createdAt = Date.parse(asIsoDate(latestLog.created_at) ?? "");

      return Number.isFinite(createdAt) && now - createdAt > SENDING_RETRY_MS;
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
    sending: "Discord-Aktenbogen wird gesendet",
    sent: "Discord-Aktenbogen DM gesendet",
    skipped: "Discord-Aktenbogen uebersprungen",
  };

  return labels[status] ?? "Discord-Aktenbogen aktualisiert";
}

function normalizeAnswers(value: unknown): IntakeAnswers {
  const record = asRecord(value);
  const age = asInteger(record.age);

  return {
    age: age === null ? null : Math.min(Math.max(age, 0), 120),
    name: trimText(record.name ?? record.recordName, 120),
    otherInfo: trimText(record.otherInfo ?? record.notes, 1200),
    profession: trimText(record.profession, 120),
    residence: trimText(record.residence, 120),
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
