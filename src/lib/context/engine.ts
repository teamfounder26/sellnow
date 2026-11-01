import { eq } from "drizzle-orm";
import type { DB } from "@/lib/db";
import { storefronts, storefrontVersions, creatives, campaigns, businessProfiles } from "@/lib/db/schema";
import { notify } from "@/lib/audit";

/**
 * AI Context Engine — shared business context and change impact detection.
 * When a fact changes (e.g. price), find every artefact that may now be stale and raise a
 * notification with the affected items. Nothing published is changed automatically.
 */

function priceStrings(sen: number): string[] {
  const rm = (sen / 100).toFixed(2);
  const whole = Number.isInteger(sen / 100) ? String(sen / 100) : null;
  return [`RM${rm}`, `RM ${rm}`, ...(whole ? [`RM${whole}`, `RM ${whole}`] : [])];
}

function mentions(haystack: unknown, needles: string[]): boolean {
  const s = JSON.stringify(haystack ?? "");
  return needles.some((n) => s.includes(n));
}

export type ImpactItem = { kind: "storefront_draft" | "storefront_live" | "creative" | "campaign" | "faq"; id: string; label: string };

export async function detectPriceChangeImpacts(
  db: DB,
  workspaceId: string,
  change: { productId: string; productName: string; oldSen: number; newSen: number },
): Promise<ImpactItem[]> {
  const old = priceStrings(change.oldSen);
  const items: ImpactItem[] = [];

  const sf = await db.query.storefronts.findFirst({ where: eq(storefronts.workspaceId, workspaceId) });
  if (sf) {
    if (mentions(sf.draftContent, old)) items.push({ kind: "storefront_draft", id: sf.id, label: "storefront_draft" });
    if (sf.publishedVersionId) {
      const live = await db.query.storefrontVersions.findFirst({ where: eq(storefrontVersions.id, sf.publishedVersionId) });
      // The live page renders product prices from the catalog; copy may still quote the old price.
      if (live && (mentions(live.content, old) || live.content.productIds.includes(change.productId))) {
        items.push({ kind: "storefront_live", id: sf.id, label: "storefront_live" });
      }
    }
  }
  const crs = await db.query.creatives.findMany({ where: eq(creatives.workspaceId, workspaceId) });
  for (const c of crs) {
    if (c.productId === change.productId && (c.priceSnapshotSen === change.oldSen || mentions(c.content, old))) {
      items.push({ kind: "creative", id: c.id, label: c.type });
    }
  }
  const cps = await db.query.campaigns.findMany({ where: eq(campaigns.workspaceId, workspaceId) });
  for (const c of cps) if (c.productId === change.productId && c.status !== "failed") items.push({ kind: "campaign", id: c.id, label: c.name });
  const profile = await db.query.businessProfiles.findFirst({ where: eq(businessProfiles.workspaceId, workspaceId) });
  if (profile && mentions(profile.faq, old)) items.push({ kind: "faq", id: workspaceId, label: "faq" });

  if (items.length) {
    await notify(db, workspaceId, "context.price_changed", {
      productId: change.productId,
      productName: change.productName,
      oldSen: change.oldSen,
      newSen: change.newSen,
      items,
    });
  }
  return items;
}
