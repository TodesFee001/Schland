export type EnvironmentStatus = {
  discordBotSyncToken: boolean;
  supabaseUrl: boolean;
  supabasePublishableKey: boolean;
  supabaseServiceRole: boolean;
  vercel: boolean;
};

export function getEnvironmentStatus(): EnvironmentStatus {
  return {
    discordBotSyncToken: Boolean(process.env.DISCORD_BOT_SYNC_TOKEN),
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
