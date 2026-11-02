import { and, desc, eq, isNull, sql } from "drizzle-orm";
import type { DB, Tx } from "@/lib/db";
import { systemAlerts } from "@/lib/db/schema";
import { newId } from "@/lib/ids";
import { log } from "@/lib/log";

type AlertInput = { kind: string; severity: "info" | "warning" | "critical"; message: string; dedupeKey: string; link?: string; workspaceId?: string | null; data?: Record<string, unknown> };

/** Opens an alert, or bumps the count of the open alert with the same key (no flooding). */
export async function raiseAlert(db: DB | Tx, a: AlertInput) {
  log(a.severity === "critical" ? "error" : "warn", "alert", { kind: a.kind, key: a.dedupeKey });
  const open = await db.query.systemAlerts.findFirst({ where: and(eq(systemAlerts.dedupeKey, a.dedupeKey), isNull(systemAlerts.resolvedAt)) });
  if (open) {
    await db.update(systemAlerts).set({ count: sql`${systemAlerts.count} + 1`, message: a.message, updatedAt: new Date() }).where(eq(systemAlerts.id, open.id));
    return open.id;
  }
  const id = newId("alr");
  await db.insert(systemAlerts).values({ id, kind: a.kind, severity: a.severity, message: a.message, dedupeKey: a.dedupeKey, link: a.link ?? null, workspaceId: a.workspaceId ?? null, data: a.data ?? {} }).onConflictDoNothing();
  return id;
}

export async function resolveAlert(db: DB, id: string, userId: string) {
  await db.update(systemAlerts).set({ resolvedAt: new Date(), resolvedBy: userId, updatedAt: new Date() }).where(eq(systemAlerts.id, id));
}

/** Auto-resolve when the condition clears (e.g. credit topped up). */
export async function clearAlert(db: DB | Tx, dedupeKey: string) {
  await db.update(systemAlerts).set({ resolvedAt: new Date(), updatedAt: new Date() }).where(and(eq(systemAlerts.dedupeKey, dedupeKey), isNull(systemAlerts.resolvedAt)));
}

export async function openAlerts(db: DB, limit = 50) {
  return db.query.systemAlerts.findMany({ where: isNull(systemAlerts.resolvedAt), orderBy: [desc(systemAlerts.updatedAt)], limit });
}
