export type EnvironmentStatus = {
  discordApplicationId: boolean;
  cronSecret: boolean;
  discordClientId: boolean;
  discordClientSecret: boolean;
  discordBotToken: boolean;
  discordBotSyncToken: boolean;
  discordGuildId: boolean;
  discordInviteChannelId: boolean;
  discordPublicKey: boolean;
  googleDriveClientEmail: boolean;
  googleDrivePrivateKey: boolean;
  googleDriveRootFolderId: boolean;
  googleDocsTemplateId: boolean;
  openAiApiKey: boolean;
  openAiModel: boolean;
  openAiModelConfigured: boolean;
  openAiModelName: string;
  supabaseUrl: boolean;
  supabasePublishableKey: boolean;
  supabaseServiceRole: boolean;
  vercel: boolean;
};

export function getEnvironmentStatus(): EnvironmentStatus {
  const openAiModelName = process.env.OPENAI_MODEL?.trim() || "gpt-5.5";

  return {
    discordApplicationId: Boolean(process.env.DISCORD_APPLICATION_ID),
    cronSecret: Boolean(process.env.CRON_SECRET),
    discordClientId: Boolean(process.env.DISCORD_CLIENT_ID),
    discordClientSecret: Boolean(process.env.DISCORD_CLIENT_SECRET),
    discordBotToken: Boolean(process.env.DISCORD_BOT_TOKEN),
    discordBotSyncToken: Boolean(process.env.DISCORD_BOT_SYNC_TOKEN),
    discordGuildId: Boolean(process.env.DISCORD_GUILD_ID),
    discordInviteChannelId: Boolean(process.env.DISCORD_INVITE_CHANNEL_ID),
    discordPublicKey: Boolean(process.env.DISCORD_PUBLIC_KEY),
    googleDriveClientEmail: Boolean(
      process.env.GOOGLE_DRIVE_CLIENT_EMAIL ??
        process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
    ),
    googleDrivePrivateKey: Boolean(
      process.env.GOOGLE_DRIVE_PRIVATE_KEY ??
        process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY,
    ),
    googleDriveRootFolderId: Boolean(process.env.GOOGLE_DRIVE_ROOT_FOLDER_ID),
    googleDocsTemplateId: Boolean(
      process.env.GOOGLE_DOCS_TEMPLATE_ID ??
        process.env.GOOGLE_DRIVE_DOCS_TEMPLATE_ID,
    ),
    openAiApiKey: Boolean(process.env.OPENAI_API_KEY),
    openAiModel: Boolean(openAiModelName),
    openAiModelConfigured: Boolean(process.env.OPENAI_MODEL?.trim()),
    openAiModelName,
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
