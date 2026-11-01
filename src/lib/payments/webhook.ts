import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { integrations } from "@/lib/db/schema";
import { applyPaymentEvent } from "@/lib/commerce/events";
import { log } from "@/lib/log";
import type { VerifiedEvent } from "./types";

/** Loads the integration a webhook URL points at (the URL carries no secrets; signatures do). */
export async function loadIntegration(id: string, provider: string) {
  const db = await getDb();
  const row = await db.query.integrations.findFirst({ where: eq(integrations.id, id) });
  if (!row || row.provider !== provider) return null;
  return { db, row };
}

export async function handleVerified(workspaceId: string, ev: VerifiedEvent) {
  const db = await getDb();
  const r = await applyPaymentEvent(db, workspaceId, ev);
  log(r.status === "rejected" ? "warn" : "info", "payment.webhook", { provider: ev.provider, eventId: ev.eventId, type: ev.type, ...r });
  // Acknowledge duplicates/ignored events with 200 so providers stop retrying.
  return new Response(JSON.stringify({ received: true, status: r.status }), { status: 200, headers: { "content-type": "application/json" } });
}
