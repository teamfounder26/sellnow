import { and, eq, sql } from "drizzle-orm";
import type { DB, Tx } from "@/lib/db";
import { adSlotLedger, adsSubscriptions } from "@/lib/db/schema";
import { newId } from "@/lib/ids";
import { AppError } from "@/lib/errors";
import { lockWorkspace } from "@/lib/billing/credits";
import { audit } from "@/lib/audit";

/**
 * AI Ads Studio quota. Limits NEW publications only — viewing, editing, pausing, resuming and
 * managing existing ads never touches slots, and nothing here ever pauses a live campaign.
 *   Free: 3 trial slots, once per workspace.  Paid: 3 slots per billing period, no rollover.
 */
export const ADS_STUDIO = {
  trialSlots: 3,
  monthlySlots: 3,
  /** Promotional price, configurable without code changes (ADS_STUDIO_PRICE_SEN). No fake "was" price. */
  priceSen: () => Number(process.env.ADS_STUDIO_PRICE_SEN) || 15000,
};

export type Sub = typeof adsSubscriptions.$inferSelect;

/** A subscription grants monthly slots only while active, paid, and inside its current period. */
export function subscriptionActive(sub: Sub | null | undefined, now = new Date()) {
  return Boolean(sub && sub.status === "active" && sub.paymentStatus === "paid" && sub.currentPeriodStart <= now && now < sub.currentPeriodEnd);
}

export function periodKey(sub: Sub) {
  return sub.currentPeriodStart.toISOString().slice(0, 10);
}

export async function quotaState(db: DB | Tx, workspaceId: string, now = new Date()) {
  const sub = (await db.query.adsSubscriptions.findFirst({ where: eq(adsSubscriptions.workspaceId, workspaceId) })) ?? null;
  const rows = await db
    .select({ kind: adSlotLedger.kind, period: adSlotLedger.periodStart, n: sql<number>`count(*)::int` })
    .from(adSlotLedger)
    .where(eq(adSlotLedger.workspaceId, workspaceId))
    .groupBy(adSlotLedger.kind, adSlotLedger.periodStart);
  const trialUsed = rows.filter((r) => r.kind === "trial").reduce((a, r) => a + Number(r.n), 0);
  const active = subscriptionActive(sub, now);
  const monthlyUsed = active ? rows.filter((r) => r.kind === "monthly" && r.period === periodKey(sub!)).reduce((a, r) => a + Number(r.n), 0) : 0;
  const trialRemaining = Math.max(0, ADS_STUDIO.trialSlots - trialUsed);
  const monthlyRemaining = active ? Math.max(0, ADS_STUDIO.monthlySlots - monthlyUsed) : 0;
  return {
    plan: active ? ("paid" as const) : ("free" as const),
    subscription: sub,
    trialUsed,
    trialRemaining,
    monthlyUsed,
    monthlyRemaining,
    remaining: monthlyRemaining + trialRemaining,
    periodEnd: active ? sub!.currentPeriodEnd : null,
  };
}

/**
 * Reserves a slot for a publish in flight (inside a workspace row lock, so concurrent publishes
 * cannot exceed the quota). Idempotent per ad: an existing reservation/consumption is returned.
 * Paid workspaces use their monthly slots first, then any unused trial slots.
 */
export async function reserveSlot(db: DB, workspaceId: string, adId: string, now = new Date()) {
  return db.transaction(async (tx) => {
    await lockWorkspace(tx, workspaceId);
    const existing = await tx.query.adSlotLedger.findFirst({ where: and(eq(adSlotLedger.adId, adId), eq(adSlotLedger.workspaceId, workspaceId)) });
    if (existing) return existing;
    const q = await quotaState(tx, workspaceId, now);
    const kind = q.monthlyRemaining > 0 ? "monthly" : q.trialRemaining > 0 ? "trial" : null;
    if (!kind) throw new AppError(q.plan === "paid" ? "ads.monthlyQuotaUsed" : "ads.trialUsed");
    const [row] = await tx
      .insert(adSlotLedger)
      .values({ id: newId("slot"), workspaceId, adId, kind, periodStart: kind === "monthly" ? periodKey(q.subscription!) : null })
      .returning();
    return row!;
  });
}

/** Called only after Meta confirms the ad exists and was activated. */
export async function consumeSlot(db: DB | Tx, workspaceId: string, adId: string, metaAdId: string) {
  await db.update(adSlotLedger).set({ status: "consumed", metaAdId, consumedAt: new Date() }).where(and(eq(adSlotLedger.adId, adId), eq(adSlotLedger.workspaceId, workspaceId)));
}

/** Failed publish → the reservation is released (a failure never consumes a slot). Consumed slots are never released. */
export async function releaseSlot(db: DB | Tx, workspaceId: string, adId: string) {
  await db.delete(adSlotLedger).where(and(eq(adSlotLedger.adId, adId), eq(adSlotLedger.workspaceId, workspaceId), eq(adSlotLedger.status, "reserved")));
}

/**
 * Starts/renews a subscription period. Real payments must call this from a verified billing
 * webhook; until SellNow billing is connected only the no-charge TEST activation uses it.
 */
export async function activateSubscription(db: DB, workspaceId: string, opts: { provider: string; providerRef?: string; now?: Date; actorUserId?: string }) {
  const start = opts.now ?? new Date();
  const end = new Date(start);
  end.setMonth(end.getMonth() + 1);
  const values = { workspaceId, status: "active" as const, priceSen: ADS_STUDIO.priceSen(), currentPeriodStart: start, currentPeriodEnd: end, paymentStatus: "paid", provider: opts.provider, providerRef: opts.providerRef ?? null, updatedAt: new Date() };
  await db.insert(adsSubscriptions).values(values).onConflictDoUpdate({ target: adsSubscriptions.workspaceId, set: values });
  await audit(db, { workspaceId, actorUserId: opts.actorUserId, action: "ads.subscription_activated", data: { provider: opts.provider, periodEnd: end.toISOString() } });
}

/** Payment failure / cancellation only blocks NEW publications; live Meta campaigns are left untouched. */
export async function setSubscriptionStatus(db: DB, workspaceId: string, status: "past_due" | "canceled" | "expired", paymentStatus = "failed") {
  await db.update(adsSubscriptions).set({ status, paymentStatus, updatedAt: new Date() }).where(eq(adsSubscriptions.workspaceId, workspaceId));
}
