import { NextResponse } from "next/server";

import { getEnvironmentStatus } from "@/lib/env";

export function GET() {
  return NextResponse.json({
    app: "schland-intern",
    status: "ok",
    environment: getEnvironmentStatus(),
    supabaseProjectRef: "ovfhieumrllwtghpvwem",
    discordBotImplementation: "api-prepared",
  });
}
