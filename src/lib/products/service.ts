import { and, asc, count, eq, ne } from "drizzle-orm";
import { z } from "zod";
import type { DB } from "@/lib/db";
import { products, productVariants, assets, type ProfileField, type ProductAttributes } from "@/lib/db/schema";
import { newId, slugify } from "@/lib/ids";
import { AppError } from "@/lib/errors";
import { ENGINES, CATEGORIES, type Category } from "@/lib/categories";
import { parseRinggitToSen } from "@/lib/money";
import { audit, track } from "@/lib/audit";
import { getPlan } from "@/lib/billing/plans";
import { workspaces } from "@/lib/db/schema";
import { detectPriceChangeImpacts } from "@/lib/context/engine";

type Ctx = { db: DB; workspaceId: string; userId: string };
export type Product = typeof products.$inferSelect;
export type Variant = typeof productVariants.$inferSelect;

const money = z
  .string()
  .trim()
  .transform((v, c) => {
    const sen = parseRinggitToSen(v);
    if (sen === null || sen < 0 || sen > 10_000_000_00) {
      c.addIssue({ code: "custom", message: "products.badPrice" });
      return z.NEVER;
    }
    return sen;
  });
const optMoney = z
  .string()
  .trim()
  .optional()
  .transform((v, c) => {
    if (!v) return null;
    const sen = parseRinggitToSen(v);
    if (sen === null || sen < 0) {
      c.addIssue({ code: "custom", message: "products.badPrice" });
      return z.NEVER;
    }
    return sen;
  });
const optInt = z
  .string()
  .trim()
  .optional()
  .transform((v, c) => {
    if (!v) return null;
    const n = Number(v);
    if (!Number.isInteger(n) || n < 0) {
      c.addIssue({ code: "custom", message: "products.badNumber" });
      return z.NEVER;
    }
    return n;
  });

export const productInputSchema = z
  .object({
    type: z.enum(CATEGORIES as [Category, ...Category[]]),
    name: z.string().trim().min(2, "products.nameRequired").max(120),
    description: z.string().trim().max(5000).default(""),
    price: money,
    compareAt: optMoney,
    sku: z.string().trim().max(64).optional().transform((v) => v || null),
    weightG: optInt,
    trackStock: z.boolean().default(false),
    stock: optInt,
    status: z.enum(["draft", "active", "archived"]).default("draft"),
    fulfillment: z.enum(["shipping", "pickup", "both"]).optional(),
    shippingFlat: optMoney,
    digitalAssetId: z.string().optional(),
    downloadLimit: optInt,
    downloadExpiryDays: optInt,
    serviceScope: z.string().trim().max(2000).optional(),
    serviceDuration: z.string().trim().max(200).optional(),
    imageAssetId: z.string().optional(),
    variants: z
      .array(z.object({ id: z.string().optional(), name: z.string().trim().min(1).max(60), sku: z.string().trim().max(64).optional(), price: money, stock: optInt }))
      .max(50)
      .default([]),
  })
  .superRefine((p, c) => {
    if (p.compareAt !== null && p.compareAt <= p.price) c.addIssue({ code: "custom", path: ["compareAt"], message: "products.compareAtMustBeHigher" });
    // Category-specific rules
    if (p.type === "physical") {
      if (!p.fulfillment) c.addIssue({ code: "custom", path: ["fulfillment"], message: "products.fulfillmentRequired" });
      if (p.trackStock && p.variants.length === 0 && p.stock === null) c.addIssue({ code: "custom", path: ["stock"], message: "products.stockRequired" });
    }
    if (p.type !== "physical" && p.variants.length) c.addIssue({ code: "custom", path: ["variants"], message: "products.variantsPhysicalOnly" });
    if (p.type === "digital" && p.status === "active" && !p.digitalAssetId) c.addIssue({ code: "custom", path: ["digitalAssetId"], message: "products.fileRequired" });
    if (p.type === "service" && !p.serviceScope) c.addIssue({ code: "custom", path: ["serviceScope"], message: "products.scopeRequired" });
  });

export type ProductInput = z.input<typeof productInputSchema>;

export async function listProducts(db: DB, workspaceId: string) {
  return db.query.products.findMany({ where: eq(products.workspaceId, workspaceId), orderBy: asc(products.createdAt) });
}

export async function getProduct(db: DB, workspaceId: string, id: string) {
  const p = await db.query.products.findFirst({ where: and(eq(products.id, id), eq(products.workspaceId, workspaceId)) });
  if (!p) throw new AppError("errors.notFound");
  const variants = await db.query.productVariants.findMany({
    where: and(eq(productVariants.productId, id), eq(productVariants.workspaceId, workspaceId)),
    orderBy: asc(productVariants.position),
  });
  return { ...p, variants };
}

async function uniqueSlug(db: DB, workspaceId: string, name: string, exceptId?: string) {
  const base = slugify(name);
  for (let i = 0; i < 50; i++) {
    const slug = i === 0 ? base : `${base}-${i + 1}`;
    const clash = await db.query.products.findFirst({
      where: and(eq(products.workspaceId, workspaceId), eq(products.slug, slug), ...(exceptId ? [ne(products.id, exceptId)] : [])),
    });
    if (!clash) return slug;
  }
  return `${base}-${Date.now()}`;
}

async function assertOwnedAsset(db: DB, workspaceId: string, assetId: string | undefined, kind: "image" | "digital_file") {
  if (!assetId) return;
  const a = await db.query.assets.findFirst({ where: and(eq(assets.id, assetId), eq(assets.workspaceId, workspaceId)) });
  if (!a || a.kind !== kind) throw new AppError("errors.notFound");
}

function attributesFrom(p: z.output<typeof productInputSchema>): ProductAttributes {
  return {
    ...(p.fulfillment ? { fulfillment: p.fulfillment } : {}),
    ...(p.shippingFlat !== null ? { shippingFlatSen: p.shippingFlat } : {}),
    ...(p.digitalAssetId ? { digitalAssetId: p.digitalAssetId } : {}),
    ...(p.type === "digital" ? { downloadLimit: p.downloadLimit ?? 5, downloadExpiryDays: p.downloadExpiryDays ?? 7 } : {}),
    ...(p.serviceScope ? { serviceScope: p.serviceScope } : {}),
    ...(p.serviceDuration ? { serviceDuration: p.serviceDuration } : {}),
  };
}

export async function createProduct(ctx: Ctx, input: ProductInput) {
  const p = productInputSchema.parse(input);
  const ws = await ctx.db.query.workspaces.findFirst({ where: eq(workspaces.id, ctx.workspaceId) });
  const [{ n } = { n: 0 }] = await ctx.db.select({ n: count() }).from(products).where(eq(products.workspaceId, ctx.workspaceId));
  const max = getPlan(ws?.plan ?? "free").entitlements.maxProducts;
  if (n >= max) throw new AppError("products.limitReached", { max });
  await assertOwnedAsset(ctx.db, ctx.workspaceId, p.imageAssetId, "image");
  await assertOwnedAsset(ctx.db, ctx.workspaceId, p.digitalAssetId, "digital_file");
  const id = newId("prd");
  const slug = await uniqueSlug(ctx.db, ctx.workspaceId, p.name);
  await ctx.db.transaction(async (tx) => {
    await tx.insert(products).values({
      id,
      workspaceId: ctx.workspaceId,
      type: p.type,
      name: p.name,
      slug,
      description: p.description,
      priceSen: p.price,
      compareAtSen: p.compareAt,
      sku: p.sku,
      weightG: p.weightG,
      trackStock: p.type === "physical" ? p.trackStock : false,
      stock: p.stock ?? 0,
      status: p.status,
      imageAssetId: p.imageAssetId ?? null,
      attributes: attributesFrom(p),
    });
    if (p.variants.length) {
      await tx.insert(productVariants).values(
        p.variants.map((v, i) => ({ id: newId("var"), workspaceId: ctx.workspaceId, productId: id, name: v.name, sku: v.sku || null, priceSen: v.price, stock: v.stock ?? 0, position: i })),
      );
    }
    await audit(tx, { workspaceId: ctx.workspaceId, actorUserId: ctx.userId, action: "product.created", entity: "product", entityId: id });
  });
  await track(ctx.db, "product_created", { workspaceId: ctx.workspaceId, props: { type: p.type } });
  return id;
}

export async function updateProduct(ctx: Ctx, id: string, input: ProductInput) {
  const before = await getProduct(ctx.db, ctx.workspaceId, id);
  const p = productInputSchema.parse(input);
  if (p.type !== before.type) throw new AppError("products.typeImmutable");
  await assertOwnedAsset(ctx.db, ctx.workspaceId, p.imageAssetId, "image");
  await assertOwnedAsset(ctx.db, ctx.workspaceId, p.digitalAssetId, "digital_file");
  const slug = before.name === p.name ? before.slug : await uniqueSlug(ctx.db, ctx.workspaceId, p.name, id);
  await ctx.db.transaction(async (tx) => {
    await tx
      .update(products)
      .set({
        name: p.name,
        slug,
        description: p.description,
        priceSen: p.price,
        compareAtSen: p.compareAt,
        sku: p.sku,
        weightG: p.weightG,
        trackStock: p.type === "physical" ? p.trackStock : false,
        stock: p.stock ?? 0,
        status: p.status,
        imageAssetId: p.imageAssetId ?? null,
        attributes: attributesFrom(p),
        updatedAt: new Date(),
      })
      .where(and(eq(products.id, id), eq(products.workspaceId, ctx.workspaceId)));
    // Upsert variants by id; remove deleted ones.
    const keep = new Set(p.variants.map((v) => v.id).filter(Boolean));
    for (const old of before.variants) if (!keep.has(old.id)) await tx.delete(productVariants).where(and(eq(productVariants.id, old.id), eq(productVariants.workspaceId, ctx.workspaceId)));
    for (const [i, v] of p.variants.entries()) {
      const existing = v.id ? before.variants.find((x) => x.id === v.id) : undefined;
      if (existing) {
        await tx
          .update(productVariants)
          .set({ name: v.name, sku: v.sku || null, priceSen: v.price, stock: v.stock ?? 0, position: i })
          .where(and(eq(productVariants.id, existing.id), eq(productVariants.workspaceId, ctx.workspaceId)));
      } else {
        await tx.insert(productVariants).values({ id: newId("var"), workspaceId: ctx.workspaceId, productId: id, name: v.name, sku: v.sku || null, priceSen: v.price, stock: v.stock ?? 0, position: i });
      }
    }
    await audit(tx, {
      workspaceId: ctx.workspaceId,
      actorUserId: ctx.userId,
      action: "product.updated",
      entity: "product",
      entityId: id,
      data: before.priceSen !== p.price ? { priceFromSen: before.priceSen, priceToSen: p.price } : {},
    });
  });
  if (before.priceSen !== p.price) {
    await detectPriceChangeImpacts(ctx.db, ctx.workspaceId, { productId: id, productName: p.name, oldSen: before.priceSen, newSen: p.price });
  }
}

/** Creates the first product draft from confirmed onboarding facts. */
export async function createProductFromFacts(ctx: Ctx, category: Category, f: Record<string, ProfileField>, imageAssetId?: string) {
  const val = (k: string) => (f[k] && f[k].status !== "missing" ? f[k].value : null);
  const price = Number(val("price") ?? 0);
  const fulfillment = val("fulfillment");
  return createProduct(ctx, {
    type: category,
    name: String(val("product_name") ?? val("business_name") ?? "Produk"),
    description: String(val("description") ?? ""),
    price: (price / 100).toFixed(2),
    weightG: val("weight_g") != null ? String(val("weight_g")) : undefined,
    shippingFlat: val("shipping_fee") != null ? (Number(val("shipping_fee")) / 100).toFixed(2) : undefined,
    fulfillment: category === "physical" ? ((fulfillment as "shipping" | "pickup" | "both") ?? "shipping") : undefined,
    serviceScope: category === "service" ? String(val("service_scope") ?? "") || undefined : undefined,
    serviceDuration: val("duration") ? String(val("duration")) : undefined,
    imageAssetId,
    status: "draft",
  });
}

export function checkoutModeFor(type: Category) {
  return ENGINES[type].checkout;
}
