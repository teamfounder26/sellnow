import { and, asc, desc, eq, isNull, sql } from "drizzle-orm";
import type { DB, Tx } from "@/lib/db";
import { achievementNotifications, achievementUnlocks, orders } from "@/lib/db/schema";
import { newId } from "@/lib/ids";
import { track } from "@/lib/audit";
import { orderLevel, type AchievementKey } from "./definitions";

export type Unlock = typeof achievementUnlocks.$inferSelect;

/**
 * Idempotent unlock. The unique (workspace, key, level) constraint means re-running for the same
 * event — a duplicate webhook, a regenerated website, a concurrent request — is a no-op.
 * Returns the new unlock, or null when it already existed.
 */
export async function unlock(
  db: DB | Tx,
  workspaceId: string,
  key: AchievementKey,
  level: number,
  source?: { type: string; id: string; data?: Record<string, unknown> },
): Promise<Unlock | null> {
  const id = newId("ach");
  const [row] = await db
    .insert(achievementUnlocks)
    .values({ id, workspaceId, key, level, sourceType: source?.type, sourceId: source?.id, data: source?.data ?? {} })
    .onConflictDoNothing()
    .returning();
  if (!row) return null;
  await db.insert(achievementNotifications).values({ id: newId("acn"), workspaceId, unlockId: row.id }).onConflictDoNothing();
  await track(db, "achievement_unlocked", { workspaceId, props: { key, level } });
  return row;
}

/** Server-side count of orders that qualify for the order track (see definitions.ts policy). */
export async function eligibleOrderCount(db: DB | Tx, workspaceId: string): Promise<number> {
  const [r] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(orders)
    .where(and(eq(orders.workspaceId, workspaceId), eq(orders.isTest, false), sql`${orders.paymentStatus} in ('PAID','PARTIALLY_REFUNDED')`, sql`${orders.refundedSen} < ${orders.totalSen}`));
  return Number(r?.n ?? 0);
}

/**
 * Re-evaluates the order track after a verified payment. Awards every level up to the current one
 * (so a jump from 9 → 11 still awards level 2, and catch-up after downtime is automatic).
 */
export async function evaluateOrderAchievements(db: DB, workspaceId: string, sourceOrderId?: string) {
  const count = await eligibleOrderCount(db, workspaceId);
  const level = orderLevel(count);
  const created: Unlock[] = [];
  for (let l = 1; l <= level; l++) {
    const u = await unlock(db, workspaceId, "orders", l, sourceOrderId ? { type: "order", id: sourceOrderId, data: { count } } : undefined);
    if (u) created.push(u);
  }
  return { count, level, created };
}

export async function listUnlocks(db: DB, workspaceId: string) {
  return db.query.achievementUnlocks.findMany({ where: eq(achievementUnlocks.workspaceId, workspaceId), orderBy: asc(achievementUnlocks.unlockedAt) });
}

/** Unlocks the owner has not yet collected or dismissed — shown as reward modals (oldest first). */
export async function pendingRewards(db: DB, workspaceId: string) {
  return db
    .select({ notification: achievementNotifications, unlock: achievementUnlocks })
    .from(achievementNotifications)
    .innerJoin(achievementUnlocks, eq(achievementUnlocks.id, achievementNotifications.unlockId))
    .where(and(eq(achievementNotifications.workspaceId, workspaceId), isNull(achievementNotifications.collectedAt), isNull(achievementNotifications.dismissedAt)))
    .orderBy(asc(achievementUnlocks.unlockedAt))
    .limit(5);
}

/** Collect/dismiss only change presentation state; the unlock itself is never removed. */
export async function markReward(db: DB, workspaceId: string, notificationId: string, action: "collect" | "dismiss" | "present") {
  const now = new Date();
  const set = action === "collect" ? { collectedAt: now, presentedAt: now } : action === "dismiss" ? { dismissedAt: now, presentedAt: now } : { presentedAt: now };
  await db.update(achievementNotifications).set(set).where(and(eq(achievementNotifications.id, notificationId), eq(achievementNotifications.workspaceId, workspaceId)));
}

export async function latestUnlock(db: DB, workspaceId: string) {
  return (await db.query.achievementUnlocks.findFirst({ where: eq(achievementUnlocks.workspaceId, workspaceId), orderBy: desc(achievementUnlocks.unlockedAt) })) ?? null;
}
