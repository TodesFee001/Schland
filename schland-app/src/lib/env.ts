export type EnvironmentStatus = {
  cronSecret: boolean;
  discordBotToken: boolean;
  discordBotSyncToken: boolean;
  discordGuildId: boolean;
  discordInviteChannelId: boolean;
  supabaseUrl: boolean;
  supabasePublishableKey: boolean;
  supabaseServiceRole: boolean;
  vercel: boolean;
};

export function getEnvironmentStatus(): EnvironmentStatus {
  return {
    cronSecret: Boolean(process.env.CRON_SECRET),
    discordBotToken: Boolean(process.env.DISCORD_BOT_TOKEN),
    discordBotSyncToken: Boolean(process.env.DISCORD_BOT_SYNC_TOKEN),
    discordGuildId: Boolean(process.env.DISCORD_GUILD_ID),
    discordInviteChannelId: Boolean(process.env.DISCORD_INVITE_CHANNEL_ID),
    supabaseUrl: Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL),
    supabasePublishableKey: Boolean(getSupabasePublishableKey()),
    supabaseServiceRole: Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY),
    vercel: Boolean(process.env.VERCEL),
  };
}

export function getSupabasePublishableKey() {
  return (
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  );
}

export function hasSupabasePublicEnv() {
  return Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && getSupabasePublishableKey());
}

export function hasSupabaseServerEnv() {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY,
  );
}
