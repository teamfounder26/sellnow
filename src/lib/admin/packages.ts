import { and, asc, eq, gt, isNull, or } from "drizzle-orm";
import { z } from "zod";
import type { DB, Tx } from "@/lib/db";
import { billingEvents, subscriptionPlans, tenantFeatureOverrides, tenantSubscriptions, workspaces, type PlanEntitlements, type TenantSubStatus } from "@/lib/db/schema";
import { PLANS } from "@/lib/billing/plans";
import { newId } from "@/lib/ids";
import { AppError } from "@/lib/errors";
import { audit, notify } from "@/lib/audit";

/**
 * Commercial packages live in the database (editable by Superadmin). The code-level PLANS are
 * only the first-run seed. Prices on existing tenants are locked in tenant_subscriptions.price_sen
 * (grandfathering); editing a package changes new subscriptions only.
 */
const ENT_DEFAULTS = { maxWebsites: 1, maxMembers: 3, courierAccess: true, monthlyAdsStudioAds: 3 };

export async function ensurePlansSeeded(db: DB | Tx) {
  const existing = await db.select({ id: subscriptionPlans.id }).from(subscriptionPlans).limit(1);
  if (existing.length) return;
  const rows: (typeof subscriptionPlans.$inferInsert & { entitlements: PlanEntitlements })[] = Object.values(PLANS).map((p, i) => ({
    id: p.id,
    name: p.id === "free" ? "Free" : p.id === "launch" ? "Launch" : "Growth",
    monthlySen: p.priceSen,
    annualSen: p.priceSen ? p.priceSen * 10 : null,
    monthlyCredits: p.monthlyCredits,
    transactionFeeBps: 0,
    entitlements: { ...ENT_DEFAULTS, ...p.entitlements, maxMembers: p.id === "growth" ? 10 : 3 },
    sortOrder: i,
  }));
  rows.push({ id: "enterprise", name: "Enterprise", monthlySen: 0, annualSen: null, monthlyCredits: 5000, transactionFeeBps: 0, entitlements: { ...rows[2]!.entitlements, maxProducts: 10_000, maxWorkspaces: 20, maxWebsites: 20, maxMembers: 50 }, sortOrder: 3 });
  await db.insert(subscriptionPlans).values(rows).onConflictDoNothing();
}

export async function listPlans(db: DB | Tx) {
  await ensurePlansSeeded(db);
  return db.query.subscriptionPlans.findMany({ orderBy: asc(subscriptionPlans.sortOrder) });
}

const entSchema = z.object({
  publishStorefront: z.boolean(),
  checkout: z.boolean(),
  maxProducts: z.number().int().min(0).max(1_000_000),
  maxWorkspaces: z.number().int().min(1).max(1000),
  maxWebsites: z.number().int().min(0).max(1000),
  maxMembers: z.number().int().min(1).max(1000),
  creativeStudio: z.boolean(),
  marketing: z.boolean(),
  salesAssistant: z.boolean(),
  advancedAnalytics: z.boolean(),
  courierAccess: z.boolean(),
  monthlyAdsStudioAds: z.number().int().min(0).max(1000),
});
export const planSchema = z.object({
  id: z.string().regex(/^[a-z][a-z0-9_]{1,30}$/),
  name: z.string().trim().min(2).max(60),
  status: z.enum(["active", "inactive", "archived"]),
  monthlySen: z.number().int().min(0).max(100_000_00),
  annualSen: z.number().int().min(0).max(1_000_000_00).nullable(),
  trialDays: z.number().int().min(0).max(365),
  monthlyCredits: z.number().int().min(0).max(1_000_000),
  transactionFeeBps: z.number().int().min(0).max(2000),
  entitlements: entSchema,
  sortOrder: z.number().int().min(0).max(100),
});

export async function savePlan(db: DB, actorId: string, raw: unknown) {
  const p = planSchema.parse(raw);
  await ensurePlansSeeded(db);
  const prev = await db.query.subscriptionPlans.findFirst({ where: eq(subscriptionPlans.id, p.id) });
  if (prev) await db.update(subscriptionPlans).set({ ...p, updatedAt: new Date() }).where(eq(subscriptionPlans.id, p.id));
  else await db.insert(subscriptionPlans).values(p);
  await audit(db, { workspaceId: null, actorUserId: actorId, action: prev ? "admin.package.updated" : "admin.package.created", entity: "package", entityId: p.id, data: { from: prev ? { monthlySen: prev.monthlySen, status: prev.status, transactionFeeBps: prev.transactionFeeBps } : null, to: { monthlySen: p.monthlySen, status: p.status, transactionFeeBps: p.transactionFeeBps } } });
}

/** Effective entitlements for a tenant: plan (or locked subscription) + non-expired overrides. Backend-enforced. */
export async function entitlementsFor(db: DB | Tx, workspaceId: string): Promise<PlanEntitlements & { planId: string; monthlyCredits: number; status: TenantSubStatus }> {
  await ensurePlansSeeded(db);
  const ws = await db.query.workspaces.findFirst({ where: eq(workspaces.id, workspaceId) });
  const sub = await db.query.tenantSubscriptions.findFirst({ where: eq(tenantSubscriptions.workspaceId, workspaceId) });
  const planId = sub?.planId ?? ws?.plan ?? "free";
  const plan = (await db.query.subscriptionPlans.findFirst({ where: eq(subscriptionPlans.id, planId) })) ?? (await db.query.subscriptionPlans.findFirst({ where: eq(subscriptionPlans.id, "free") }))!;
  const overrides = await db.query.tenantFeatureOverrides.findMany({ where: and(eq(tenantFeatureOverrides.workspaceId, workspaceId), or(isNull(tenantFeatureOverrides.expiresAt), gt(tenantFeatureOverrides.expiresAt, new Date()))) });
  const ent = { ...ENT_DEFAULTS, ...plan.entitlements } as PlanEntitlements;
  for (const o of overrides) if (o.key in ent) (ent as Record<string, unknown>)[o.key] = o.value;
  // A past-due / suspended / expired subscription keeps the store readable but can't publish or sell.
  const status = sub?.status ?? "active";
  if (["suspended", "expired"].includes(status) || ws?.suspendedAt) {
    ent.publishStorefront = false;
    ent.checkout = false;
  }
  return { ...ent, planId: plan.id, monthlyCredits: plan.monthlyCredits, status };
}

export async function setTenantPlan(db: DB, actorId: string, workspaceId: string, planId: string, opts: { reason: string; when: "now" | "period_end"; billingCycle?: "monthly" | "annual" }) {
  if (opts.reason.trim().length < 5) throw new AppError("settlement.noteRequired");
  const plan = await db.query.subscriptionPlans.findFirst({ where: eq(subscriptionPlans.id, planId) });
  if (!plan || plan.status !== "active") throw new AppError("admin.packageInactive");
  const sub = await db.query.tenantSubscriptions.findFirst({ where: eq(tenantSubscriptions.workspaceId, workspaceId) });
  const cycle = opts.billingCycle ?? sub?.billingCycle ?? "monthly";
  const price = cycle === "annual" ? (plan.annualSen ?? plan.monthlySen * 12) : plan.monthlySen;
  await db.transaction(async (tx) => {
    if (opts.when === "period_end" && sub) await tx.update(tenantSubscriptions).set({ scheduledPlanId: plan.id, updatedAt: new Date() }).where(eq(tenantSubscriptions.workspaceId, workspaceId));
    else {
      const values = { planId: plan.id, priceSen: price, billingCycle: cycle, status: (plan.trialDays && !sub ? "trial" : "active") as TenantSubStatus, trialEndsAt: plan.trialDays && !sub ? new Date(Date.now() + plan.trialDays * 86400_000) : null, scheduledPlanId: null, updatedAt: new Date() };
      if (sub) await tx.update(tenantSubscriptions).set(values).where(eq(tenantSubscriptions.workspaceId, workspaceId));
      else await tx.insert(tenantSubscriptions).values({ workspaceId, ...values });
      await tx.update(workspaces).set({ plan: plan.id }).where(eq(workspaces.id, workspaceId));
    }
    await tx.insert(billingEvents).values({ id: newId("bev"), workspaceId, type: opts.when === "now" ? "plan.changed" : "plan.scheduled", actorUserId: actorId, data: { from: sub?.planId ?? null, to: plan.id, priceSen: price, cycle, reason: opts.reason } });
    await audit(tx, { workspaceId, actorUserId: actorId, action: "admin.tenant.plan_changed", data: { to: plan.id, when: opts.when, reason: opts.reason } });
  });
  await notify(db, workspaceId, "subscription.plan_changed", { planId: plan.id, when: opts.when });
}

export async function setSubscriptionStatus(db: DB, actorId: string, workspaceId: string, status: TenantSubStatus, reason: string) {
  const sub = await db.query.tenantSubscriptions.findFirst({ where: eq(tenantSubscriptions.workspaceId, workspaceId) });
  if (!sub) throw new AppError("admin.noSubscription");
  await db.update(tenantSubscriptions).set({ status, updatedAt: new Date() }).where(eq(tenantSubscriptions.workspaceId, workspaceId));
  await db.insert(billingEvents).values({ id: newId("bev"), workspaceId, type: "status.changed", actorUserId: actorId, data: { from: sub.status, to: status, reason } });
  await audit(db, { workspaceId, actorUserId: actorId, action: "admin.tenant.subscription_status", data: { from: sub.status, to: status, reason } });
}

export async function setOverride(db: DB, actorId: string, workspaceId: string, key: keyof PlanEntitlements, value: unknown, reason: string, expiresAt?: Date | null) {
  if (!(key in entSchema.shape)) throw new AppError("errors.validation");
  const parsed = entSchema.shape[key].parse(value);
  if (reason.trim().length < 5) throw new AppError("settlement.noteRequired");
  await db
    .insert(tenantFeatureOverrides)
    .values({ id: newId("tfo"), workspaceId, key, value: parsed, reason, createdBy: actorId, expiresAt: expiresAt ?? null })
    .onConflictDoUpdate({ target: [tenantFeatureOverrides.workspaceId, tenantFeatureOverrides.key], set: { value: parsed, reason, createdBy: actorId, expiresAt: expiresAt ?? null, createdAt: new Date() } });
  await audit(db, { workspaceId, actorUserId: actorId, action: "admin.tenant.override", data: { key, value: parsed, reason } });
}
