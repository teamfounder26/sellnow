import { and, eq, inArray } from "drizzle-orm";
import type { DB, Tx } from "@/lib/db";
import { products, productVariants, discountCodes } from "@/lib/db/schema";
import { ENGINES } from "@/lib/categories";
import { percentOf } from "@/lib/money";
import { AppError } from "@/lib/errors";

export type CartLine = { productId: string; variantId?: string | null; quantity: number };
export type QuoteLine = {
  productId: string;
  variantId: string | null;
  productType: (typeof products.$inferSelect)["type"];
  name: string;
  unitPriceSen: number;
  quantity: number;
  totalSen: number;
  trackStock: boolean;
};
export type Quote = {
  lines: QuoteLine[];
  subtotalSen: number;
  discountSen: number;
  shippingSen: number;
  totalSen: number;
  discountCodeId: string | null;
  requiresShippingAddress: boolean;
  deliveryMethod: "shipping" | "pickup" | null;
};

export const MAX_QTY = 99;

/**
 * Server-side price calculation. The client only sends product ids, variant ids, quantities,
 * an optional coupon code and delivery method — every amount is computed here from the catalog.
 */
export async function computeQuote(
  db: DB | Tx,
  workspaceId: string,
  input: { lines: CartLine[]; couponCode?: string | null; deliveryMethod?: "shipping" | "pickup" | null },
): Promise<Quote> {
  if (!input.lines.length) throw new AppError("checkout.emptyCart");
  const merged = new Map<string, CartLine>();
  for (const l of input.lines) {
    if (!Number.isInteger(l.quantity) || l.quantity < 1 || l.quantity > MAX_QTY) throw new AppError("checkout.badQuantity");
    const key = `${l.productId}:${l.variantId ?? ""}`;
    const prev = merged.get(key);
    merged.set(key, { ...l, quantity: (prev?.quantity ?? 0) + l.quantity });
  }
  const ids = [...new Set(input.lines.map((l) => l.productId))];
  const prods = await db.query.products.findMany({ where: and(eq(products.workspaceId, workspaceId), inArray(products.id, ids)) });
  const variantIds = input.lines.map((l) => l.variantId).filter((v): v is string => Boolean(v));
  const vars = variantIds.length
    ? await db.query.productVariants.findMany({ where: and(eq(productVariants.workspaceId, workspaceId), inArray(productVariants.id, variantIds)) })
    : [];

  const lines: QuoteLine[] = [];
  let needsShipping = false;
  let canPickup = true;
  let shippingSen = 0;
  for (const l of merged.values()) {
    const p = prods.find((x) => x.id === l.productId);
    if (!p || p.status !== "active") throw new AppError("checkout.productUnavailable");
    if (ENGINES[p.type].checkout !== "full") throw new AppError("checkout.categoryNotPurchasable");
    const hasVariants = (await db.query.productVariants.findFirst({ where: eq(productVariants.productId, p.id) })) != null;
    let unit = p.priceSen;
    let name = p.name;
    if (l.variantId) {
      const v = vars.find((x) => x.id === l.variantId && x.productId === p.id);
      if (!v) throw new AppError("checkout.productUnavailable");
      unit = v.priceSen;
      name = `${p.name} — ${v.name}`;
    } else if (hasVariants) {
      throw new AppError("checkout.variantRequired");
    }
    if (p.type === "digital" && l.quantity !== 1) throw new AppError("checkout.badQuantity");
    if (p.type === "physical") {
      const f = p.attributes.fulfillment ?? "shipping";
      if (f !== "pickup") needsShipping = true;
      if (f === "shipping") canPickup = false;
      shippingSen = Math.max(shippingSen, p.attributes.shippingFlatSen ?? 0);
    }
    lines.push({
      productId: p.id,
      variantId: l.variantId ?? null,
      productType: p.type,
      name,
      unitPriceSen: unit,
      quantity: l.quantity,
      totalSen: unit * l.quantity,
      trackStock: p.trackStock,
    });
  }
  const subtotalSen = lines.reduce((a, l) => a + l.totalSen, 0);

  let deliveryMethod: Quote["deliveryMethod"] = null;
  if (lines.some((l) => l.productType === "physical")) {
    deliveryMethod = input.deliveryMethod === "pickup" && canPickup ? "pickup" : needsShipping ? "shipping" : "pickup";
  }
  if (deliveryMethod !== "shipping") shippingSen = 0;

  let discountSen = 0;
  let discountCodeId: string | null = null;
  const code = input.couponCode?.trim().toUpperCase();
  if (code) {
    const dc = await db.query.discountCodes.findFirst({ where: and(eq(discountCodes.workspaceId, workspaceId), eq(discountCodes.code, code)) });
    if (!dc || !dc.active || (dc.maxRedemptions !== null && dc.redemptions >= dc.maxRedemptions)) throw new AppError("checkout.badCoupon");
    discountSen = dc.kind === "percent" ? percentOf(subtotalSen, Math.min(100, Math.max(0, dc.value))) : Math.min(dc.value, subtotalSen);
    discountCodeId = dc.id;
  }
  const totalSen = subtotalSen - discountSen + shippingSen;
  if (totalSen < 100) throw new AppError("checkout.minimumAmount"); // gateways require ≥ RM1.00
  return { lines, subtotalSen, discountSen, shippingSen, totalSen, discountCodeId, requiresShippingAddress: deliveryMethod === "shipping", deliveryMethod };
}
