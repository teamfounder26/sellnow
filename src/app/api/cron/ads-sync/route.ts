import { NextResponse } from "next/server";
import { eq, and } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { integrations } from "@/lib/db/schema";
import { syncWorkspaceAds } from "@/lib/ads/service";

/** Scheduled Meta performance sync (call every ~1–3 hours with header x-cron-key: $CRON_SECRET). */
export async function POST(req: Request) {
  if (!process.env.CRON_SECRET || req.headers.get("x-cron-key") !== process.env.CRON_SECRET) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const db = await getDb();
  const rows = await db.query.integrations.findMany({ where: and(eq(integrations.provider, "meta"), eq(integrations.status, "connected")) });
  let synced = 0;
  for (const r of rows) synced += (await syncWorkspaceAds(db, r.workspaceId)).synced;
  return NextResponse.json({ workspaces: rows.length, synced });
}
