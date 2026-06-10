export const LOCKDOWN_ACCESS_COOKIE = "schland_lockdown_access";
export const LOCKDOWN_ACCESS_SECONDS = 45 * 60;

export type LockdownStatus = {
  active: boolean;
  activatedAt: string;
  activatedByName: string;
  botError: string;
  botStatus: string;
  canManage: boolean;
  importantChannelIds: string[];
  reason: string;
};

export function getLockdownCookieOptions() {
  return {
    httpOnly: true,
    maxAge: LOCKDOWN_ACCESS_SECONDS,
    path: "/",
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
  };
}

export function mapLockdownStatusRow(row: Record<string, unknown> | null) {
  return {
    active: Boolean(row?.active),
    activatedAt: String(row?.activated_at ?? ""),
    activatedByName: String(row?.activated_by_name ?? ""),
    botError: String(row?.bot_error ?? ""),
    botStatus: String(row?.bot_status ?? "idle"),
    canManage: Boolean(row?.can_manage),
    importantChannelIds: Array.isArray(row?.important_channel_ids)
      ? row.important_channel_ids.map(String).filter(Boolean)
      : [],
    reason: String(row?.reason ?? ""),
  } satisfies LockdownStatus;
}
