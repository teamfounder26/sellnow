import { and, eq, isNotNull, ne, gt, sql } from "drizzle-orm";
import type { DB } from "@/lib/db";
import { businessProfiles, products, storefronts, campaigns, orders } from "@/lib/db/schema";

export type MilestoneId = "idea_ready" | "first_product" | "store_live" | "first_campaign" | "first_sale" | "growth_stage";
export type Milestone = { id: MilestoneId; done: boolean };

/** Growth Stage criteria: ≥10 verified non-test paid orders AND ≥ RM1,000 net revenue. */
export const GROWTH_CRITERIA = { orders: 10, revenueSen: 100_000 };

/** Milestones are derived from persisted records only — they cannot be unlocked by demo events. */
export async function getMilestones(db: DB, workspaceId: string): Promise<Milestone[]> {
  const profile = await db.query.businessProfiles.findFirst({ where: and(eq(businessProfiles.workspaceId, workspaceId), isNotNull(businessProfiles.confirmedAt)) });
  const product = await db.query.products.findFirst({ where: and(eq(products.workspaceId, workspaceId), ne(products.status, "archived"), gt(products.priceSen, 0)) });
  const store = await db.query.storefronts.findFirst({ where: and(eq(storefronts.workspaceId, workspaceId), isNotNull(storefronts.publishedVersionId)) });
  const campaign = await db.query.campaigns.findFirst({ where: and(eq(campaigns.workspaceId, workspaceId), eq(campaigns.status, "active"), isNotNull(campaigns.externalId)) });
  const [sales] = await db
    .select({ n: sql<number>`count(*)::int`, sen: sql<number>`coalesce(sum(${orders.totalSen} - ${orders.refundedSen}),0)::int` })
    .from(orders)
    .where(and(eq(orders.workspaceId, workspaceId), eq(orders.isTest, false), sql`${orders.paymentStatus} in ('PAID','PARTIALLY_REFUNDED')`));
  const n = Number(sales?.n ?? 0);
  return [
    { id: "idea_ready", done: Boolean(profile) },
    { id: "first_product", done: Boolean(product) },
    { id: "store_live", done: Boolean(store) },
    { id: "first_campaign", done: Boolean(campaign) },
    { id: "first_sale", done: n > 0 },
    { id: "growth_stage", done: n >= GROWTH_CRITERIA.orders && Number(sales?.sen ?? 0) >= GROWTH_CRITERIA.revenueSen },
  ];
}
