import { eq, inArray } from "drizzle-orm";
import type { DB } from "@/lib/db";
import { products } from "@/lib/db/schema";
import * as svc from "./service";
import { quotaState } from "./quota";
import type { DecisionResult } from "./decision";
import type { CppPlan } from "./playbook";

export type AdRow = {
  ad: svc.Ad;
  product: { id: string; name: string; priceSen: number; costSen: number | null; imageAssetId: string | null } | null;
  totals: { spendSen: number; purchases: number; revenueSen: number; clicks: number; impressions: number; leads: number };
  prev: { spendSen: number; purchases: number; revenueSen: number };
  storeOrders: { orders: number; revenueSen: number };
  decision: (DecisionResult & { plan: CppPlan }) | null;
};

const ZERO = { spendSen: 0, purchases: 0, revenueSen: 0, clicks: 0, impressions: 0, leads: 0 };

/** Everything the Overview / Performance tabs show — sourced only from synced Meta data and store orders. */
export async function studioData(db: DB, workspaceId: string, range: svc.Range) {
  const [list, conn, pb, quota] = await Promise.all([svc.listAds(db, workspaceId), svc.getMetaConnection(db, workspaceId), svc.getPlaybook(db, workspaceId), quotaState(db, workspaceId)]);
  const [cur, prev, store] = await Promise.all([svc.totalsByAd(db, workspaceId, range), svc.totalsByAd(db, workspaceId, svc.previousRange(range)), svc.storeOrdersByAd(db, workspaceId, range)]);
  const ids = [...new Set(list.map((a) => a.productId).filter((x): x is string => Boolean(x)))];
  const prods = ids.length ? await db.query.products.findMany({ where: inArray(products.id, ids) }) : [];
  const rows: AdRow[] = [];
  for (const ad of list) {
    const p = prods.find((x) => x.id === ad.productId);
    rows.push({
      ad,
      product: p ? { id: p.id, name: p.name, priceSen: p.priceSen, costSen: p.costSen, imageAssetId: p.imageAssetId } : null,
      totals: cur.get(ad.id) ?? ZERO,
      prev: prev.get(ad.id) ?? ZERO,
      storeOrders: store.get(ad.id) ?? { orders: 0, revenueSen: 0 },
      decision: await svc.adDecision(db, ad, pb, svc.trackingReadyFor(ad, conn)),
    });
  }
  const sum = (k: "spendSen" | "purchases" | "revenueSen", src: "totals" | "prev" = "totals") => rows.reduce((a, r) => a + r[src][k], 0);
  const spendSen = sum("spendSen");
  const purchases = sum("purchases");
  const revenueSen = sum("revenueSen");
  const spending = rows.filter((r) => r.totals.spendSen > 0 || r.totals.purchases > 0);
  const missingCosts = [...new Set(spending.filter((r) => r.product && r.product.costSen == null).map((r) => r.product!.name))];
  const profitSen = spending.length && missingCosts.length === 0 ? spending.reduce((a, r) => a + r.totals.revenueSen - r.totals.spendSen - (r.product!.costSen! + Math.round((r.product!.priceSen * pb.feePct) / 100) + pb.shippingSubsidySen + pb.otherVariableSen) * r.totals.purchases, 0) : null;
  const lastSynced = list.reduce<Date | null>((a, x) => (x.lastSyncedAt && (!a || x.lastSyncedAt > a) ? x.lastSyncedAt : a), null);
  return {
    rows,
    conn,
    pb,
    quota,
    lastSynced,
    totals: {
      spendSen,
      purchases,
      revenueSen,
      cppSen: purchases > 0 ? Math.round(spendSen / purchases) : null,
      roas: spendSen > 0 ? Math.round((revenueSen / spendSen) * 100) / 100 : null,
      profitSen,
      missingCosts,
      prev: { spendSen: sum("spendSen", "prev"), purchases: sum("purchases", "prev"), revenueSen: sum("revenueSen", "prev") },
      active: list.filter((a) => a.status === "active" || a.status === "pending_review").length,
      attention: rows.filter((r) => r.decision?.decision === "cut" || r.ad.status === "rejected" || r.ad.status === "failed").length,
      storeOrders: rows.reduce((a, r) => a + r.storeOrders.orders, 0),
    },
  };
}

export async function productsForAds(db: DB, workspaceId: string) {
  return db.query.products.findMany({ where: eq(products.workspaceId, workspaceId) });
}
