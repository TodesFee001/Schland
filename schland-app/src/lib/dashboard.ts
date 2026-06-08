import { hasSupabasePublicEnv } from "@/lib/env";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type DashboardSnapshot = {
  filesCount: number;
  membersCount: number;
  rolesCount: number;
  source: "demo" | "supabase";
  voiceHoursMonth: number;
  warning?: string;
};

export const demoDashboardSnapshot: DashboardSnapshot = {
  filesCount: 342,
  membersCount: 128,
  rolesCount: 7,
  source: "demo",
  voiceHoursMonth: 1284,
};

export async function getDashboardSnapshot(): Promise<DashboardSnapshot> {
  if (!hasSupabasePublicEnv()) {
    return {
      ...demoDashboardSnapshot,
      warning: "Supabase ist noch nicht verbunden.",
    };
  }

  try {
    const supabase = await createSupabaseServerClient();
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth() + 1;

    const [membersResult, filesResult, rolesResult, voiceResult] =
      await Promise.all([
        supabase.from("members").select("id", { count: "exact", head: true }),
        supabase.from("files").select("id", { count: "exact", head: true }),
        supabase.from("roles").select("id", { count: "exact", head: true }),
        supabase
          .from("voice_activity_monthly")
          .select("voice_minutes")
          .eq("year", year)
          .eq("month", month),
      ]);

    const firstError =
      membersResult.error ??
      filesResult.error ??
      rolesResult.error ??
      voiceResult.error;

    if (firstError) {
      return {
        ...demoDashboardSnapshot,
        warning: firstError.message,
      };
    }

    const voiceMinutes =
      voiceResult.data?.reduce(
        (sum, row) => sum + Number(row.voice_minutes ?? 0),
        0,
      ) ?? 0;

    return {
      filesCount: filesResult.count ?? 0,
      membersCount: membersResult.count ?? 0,
      rolesCount: rolesResult.count ?? 0,
      source: "supabase",
      voiceHoursMonth: Math.round(voiceMinutes / 60),
    };
  } catch (error) {
    return {
      ...demoDashboardSnapshot,
      warning: error instanceof Error ? error.message : "Supabase Fehler",
    };
  }
}
