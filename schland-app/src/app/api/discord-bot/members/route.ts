import { NextResponse } from "next/server";

import {
  asInteger,
  asIsoDate,
  asRecord,
  asText,
  getDiscordBotAuthError,
  readJsonObject,
} from "@/lib/discord-bot-api";
import { getSupabaseAdminClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type SupabaseAdminClient = ReturnType<typeof getSupabaseAdminClient>;

const MEMBER_BATCH_LIMIT = 250;

export async function POST(request: Request) {
  const authError = getDiscordBotAuthError(request);

  if (authError) {
    return authError;
  }

  const body = await readJsonObject(request);
  const supabase = getSupabaseAdminClient();
  const batchMembers = Array.isArray(body?.members)
    ? body.members.slice(0, MEMBER_BATCH_LIMIT)
    : null;

  if (batchMembers) {
    const results = [];
    let failed = 0;
    let skippedBots = 0;

    for (const member of batchMembers) {
      try {
        const result = await writeDiscordMember(supabase, asRecord(member));

        if ("skipped" in result && result.skipped === "bot") {
          skippedBots += 1;
        }

        results.push(result);
      } catch (error) {
        failed += 1;
        console.error("discord bot member batch item failed", {
          message: error instanceof Error ? error.message : String(error),
        });
      }
    }

    return NextResponse.json({
      failed,
      results,
      skippedBots,
      synced: results.filter((result) => result.member).length,
      total: batchMembers.length,
    });
  }

  try {
    const result = await writeDiscordMember(supabase, body);

    return NextResponse.json(result);
  } catch (error) {
    console.error("discord bot member upsert failed", {
      message: error instanceof Error ? error.message : String(error),
    });

    return NextResponse.json(
      { error: "member_write_failed" },
      { status: 500 },
    );
  }
}

export async function PATCH(request: Request) {
  const authError = getDiscordBotAuthError(request);

  if (authError) {
    return authError;
  }

  const body = await readJsonObject(request);
  const ids = asTextArray(
    body?.currentDiscordUserIds ?? body?.discordUserIds ?? body?.ids,
  ).filter(isSnowflake);

  if (!Array.isArray(body?.currentDiscordUserIds) && body?.action !== "reconcile") {
    return NextResponse.json(
      { error: "current_discord_user_ids_required" },
      { status: 400 },
    );
  }

  const supabase = getSupabaseAdminClient();
  const { data, error } = await supabase
    .from("members")
    .select("id,discord_id")
    .not("discord_id", "is", null)
    .eq("discord_is_bot", false);

  if (error) {
    console.error("discord bot member reconcile lookup failed", {
      code: error.code,
      details: error.details,
      message: error.message,
    });

    return NextResponse.json(
      { error: "member_reconcile_lookup_failed" },
      { status: 500 },
    );
  }

  const currentIds = new Set(ids);
  const staleMemberIds = (data ?? [])
    .filter((row) => {
      const discordId = asText(asRecord(row).discord_id);

      return discordId ? !currentIds.has(discordId) : false;
    })
    .map((row) => asText(asRecord(row).id))
    .filter((id): id is string => Boolean(id));

  if (staleMemberIds.length > 0) {
    const { error: updateError } = await supabase
      .from("members")
      .update({
        discord_last_seen_at: new Date().toISOString(),
        discord_on_server: false,
      })
      .in("id", staleMemberIds);

    if (updateError) {
      console.error("discord bot member reconcile update failed", {
        code: updateError.code,
        details: updateError.details,
        message: updateError.message,
      });

      return NextResponse.json(
        { error: "member_reconcile_update_failed" },
        { status: 500 },
      );
    }

    const { error: roleError } = await supabase
      .from("member_discord_roles")
      .delete()
      .in("member_id", staleMemberIds);

    if (roleError) {
      console.error("discord bot member reconcile role cleanup failed", {
        code: roleError.code,
        details: roleError.details,
        message: roleError.message,
      });
    }
  }

  const previousSync = await getLatestMemberSyncMetadata(supabase);

  await recordLiveMemberSync(supabase, {
    guildMemberEstimate:
      asInteger(body?.guildMemberEstimate ?? body?.guild_member_estimate) ??
      previousSync.guildMemberEstimate ??
      ids.length,
    guildName:
      asText(body?.guildName ?? body?.guild_name) ?? previousSync.guildName,
    scanned: ids.length,
    skippedBots:
      asInteger(body?.skippedBots ?? body?.skipped_bots) ??
      previousSync.skippedBots ??
      0,
  });

  return NextResponse.json({
    current: ids.length,
    markedOffServer: staleMemberIds.length,
  });
}

async function writeDiscordMember(
  supabase: SupabaseAdminClient,
  body: Record<string, unknown> | null,
) {
  const discordUserId = asText(
    body?.discordUserId ?? body?.discord_user_id ?? body?.userId,
  );
  const isBot = Boolean(body?.isBot ?? body?.bot ?? false);

  if (!discordUserId) {
    throw new Error("discord_user_id_required");
  }

  if (isBot) {
    return {
      member: null,
      skipped: "bot",
    };
  }

  const action = asText(body?.action);
  const discordOnServer =
    action === "left" || action === "remove" || body?.discordOnServer === false
      ? false
      : true;

  if (!discordOnServer) {
    return markDiscordMemberOffServer(supabase, discordUserId);
  }

  const username = asText(
    body?.discordUsername ?? body?.discord_username ?? body?.username,
  );
  const displayName = asText(
    body?.discordDisplayName ??
      body?.discord_display_name ??
      body?.displayName ??
      body?.globalName ??
      body?.nick,
  );
  const name = displayName ?? username ?? discordUserId;
  const now = new Date().toISOString();
  const joinedAt = asIsoDate(body?.joinedAt ?? body?.joined_at);
  const payload = {
    discord_display_name: displayName,
    discord_id: discordUserId,
    discord_is_bot: false,
    discord_joined_at: joinedAt,
    discord_last_seen_at: now,
    discord_on_server: true,
    discord_username: username,
    name,
  };

  const { data, error } = await supabase
    .from("members")
    .upsert(payload, { onConflict: "discord_id" })
    .select("id,name,discord_id,discord_username,discord_display_name")
    .single();

  if (error) {
    console.error("discord bot member upsert failed", {
      code: error.code,
      details: error.details,
      message: error.message,
    });

    throw new Error("member_write_failed");
  }

  const roles = getRolePayloads(body?.roles ?? body?.roleIds, body?.roleNames);
  const memberId = String(data.id);

  if (roles) {
    await syncMemberRoles(supabase, memberId, roles);
  }

  return {
    member: {
      discordDisplayName: data.discord_display_name,
      discordId: data.discord_id,
      discordUsername: data.discord_username,
      id: memberId,
      name: data.name,
    },
    rolesSynced: roles?.length ?? null,
  };
}

async function getLatestMemberSyncMetadata(supabase: SupabaseAdminClient) {
  const fallback = {
    guildMemberEstimate: null as number | null,
    guildName: null as string | null,
    skippedBots: null as number | null,
  };
  const { data, error } = await supabase
    .from("sync_runs")
    .select("metadata")
    .eq("status", "success")
    .order("started_at", { ascending: false })
    .limit(5);

  if (error) {
    console.error("discord previous sync metadata lookup failed", {
      code: error.code,
      details: error.details,
      message: error.message,
    });

    return fallback;
  }

  for (const row of data ?? []) {
    const metadata = asRecord(asRecord(row).metadata);
    const members = asRecord(metadata.members);
    const guildMemberEstimate = asInteger(members.guildMemberEstimate);
    const skippedBots = asInteger(members.skippedBots);
    const guildName = asText(members.guildName);

    if (guildMemberEstimate !== null || skippedBots !== null || guildName) {
      return {
        guildMemberEstimate,
        guildName,
        skippedBots,
      };
    }
  }

  return fallback;
}

async function recordLiveMemberSync(
  supabase: SupabaseAdminClient,
  input: {
    guildMemberEstimate: number;
    guildName: string | null;
    scanned: number;
    skippedBots: number;
  },
) {
  const now = new Date().toISOString();
  const { error } = await supabase.from("sync_runs").insert({
    finished_at: now,
    metadata: {
      heartbeat: {
        lastSeenAt: now,
      },
      implementation: "railway-discord-gateway",
      members: {
        coverageComplete: true,
        guildMemberEstimate: input.guildMemberEstimate,
        guildName: input.guildName,
        missingEstimate: 0,
        pageLimitHit: false,
        scanned: input.scanned + input.skippedBots,
        skippedBots: input.skippedBots,
        upserted: input.scanned,
      },
    },
    source: "discord-live",
    started_at: now,
    status: "success",
  });

  if (error) {
    console.error("discord live sync run write failed", {
      code: error.code,
      details: error.details,
      message: error.message,
    });
  }
}

async function markDiscordMemberOffServer(
  supabase: SupabaseAdminClient,
  discordUserId: string,
) {
  const { data, error } = await supabase
    .from("members")
    .update({
      discord_last_seen_at: new Date().toISOString(),
      discord_on_server: false,
    })
    .eq("discord_id", discordUserId)
    .select("id,name,discord_id,discord_username,discord_display_name")
    .maybeSingle();

  if (error) {
    console.error("discord bot member off-server update failed", {
      code: error.code,
      details: error.details,
      message: error.message,
    });

    throw new Error("member_write_failed");
  }

  if (data?.id) {
    const { error: roleError } = await supabase
      .from("member_discord_roles")
      .delete()
      .eq("member_id", data.id);

    if (roleError) {
      console.error("discord bot member off-server role cleanup failed", {
        code: roleError.code,
        details: roleError.details,
        message: roleError.message,
      });
    }
  }

  return {
    member: data
      ? {
          discordDisplayName: data.discord_display_name,
          discordId: data.discord_id,
          discordUsername: data.discord_username,
          id: data.id,
          name: data.name,
        }
      : null,
    offServer: true,
  };
}

async function syncMemberRoles(
  supabase: SupabaseAdminClient,
  memberId: string,
  roles: Array<{ id: string; name: string }>,
) {
  const now = new Date().toISOString();

  const { error: deleteError } = await supabase
    .from("member_discord_roles")
    .delete()
    .eq("member_id", memberId);

  if (deleteError) {
    throw new Error(`member_role_cleanup_failed: ${deleteError.message}`);
  }

  if (roles.length === 0) {
    return;
  }

  const { data, error } = await supabase
    .from("discord_roles")
    .upsert(
      roles.map((role) => ({
        discord_role_id: role.id,
        last_synced_at: now,
        role_name: role.name || `Discord-Rolle ${role.id}`,
      })),
      { onConflict: "discord_role_id" },
    )
    .select("id,discord_role_id");

  if (error) {
    throw new Error(`discord_role_sync_failed: ${error.message}`);
  }

  const roleRows = (data ?? [])
    .map((row) => asText(asRecord(row).id))
    .filter((id): id is string => Boolean(id));

  if (roleRows.length === 0) {
    return;
  }

  const { error: insertError } = await supabase
    .from("member_discord_roles")
    .insert(
      roleRows.map((discordRoleId) => ({
        discord_role_id: discordRoleId,
        member_id: memberId,
        synced_at: now,
      })),
    );

  if (insertError) {
    throw new Error(`member_role_write_failed: ${insertError.message}`);
  }
}

function getRolePayloads(rawRoles: unknown, rawRoleNames: unknown) {
  if (!Array.isArray(rawRoles)) {
    return null;
  }

  const roleNames = asRecord(rawRoleNames);
  const roles = new Map<string, string>();

  for (const role of rawRoles) {
    if (typeof role === "string" || typeof role === "number") {
      const id = asText(role);

      if (id && isSnowflake(id)) {
        roles.set(id, asText(roleNames[id]) ?? `Discord-Rolle ${id}`);
      }

      continue;
    }

    const record = asRecord(role);
    const id = asText(
      record.id ?? record.discordRoleId ?? record.discord_role_id,
    );
    const name = asText(record.name ?? record.roleName ?? record.role_name);

    if (id && isSnowflake(id)) {
      roles.set(id, name ?? asText(roleNames[id]) ?? `Discord-Rolle ${id}`);
    }
  }

  return [...roles.entries()].map(([id, name]) => ({ id, name }));
}

function asTextArray(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => asText(item))
    .filter((item): item is string => Boolean(item));
}

function isSnowflake(value: string) {
  return /^[0-9]{15,25}$/.test(value);
}
