import { NextResponse } from "next/server";

import { runDriveSync } from "@/lib/google-drive-sync";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");

  if (!process.env.CRON_SECRET || authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  if (getBerlinHour() !== "06") {
    return NextResponse.json({
      skipped: true,
      reason: "outside_berlin_06",
    });
  }

  try {
    const result = await runDriveSync({
      triggeredBy: null,
      triggerType: "scheduled_06",
    });

    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : String(error),
      },
      { status: 500 },
    );
  }
}

function getBerlinHour() {
  return new Intl.DateTimeFormat("de-DE", {
    hour: "2-digit",
    hour12: false,
    timeZone: "Europe/Berlin",
  }).format(new Date());
}
