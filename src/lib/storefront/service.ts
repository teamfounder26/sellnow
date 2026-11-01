import { and, desc, eq, inArray, isNull, max } from "drizzle-orm";
import type { DB } from "@/lib/db";
import {
  storefronts,
  storefrontVersions,
  products,
  businessProfiles,
  workspaces,
  users,
  integrations,
  type StorefrontContent,
  type StorefrontTheme,
} from "@/lib/db/schema";
import { newId, slugify } from "@/lib/ids";
import { AppError } from "@/lib/errors";
import { ENGINES } from "@/lib/categories";
import { generateWebsite } from "@/lib/website/generator";
import { audit, track, notify } from "@/lib/audit";
import { getPlan } from "@/lib/billing/plans";
import { normalizeContent, themeSchema } from "./sections";

type Ctx = { db: DB; workspaceId: string; userId: string; locale: "ms" | "en" };
export type Storefront = typeof storefronts.$inferSelect;

export const RESERVED_SLUGS = new Set(["api", "admin", "dashboard", "login", "signup", "s", "pay", "app", "www", "help", "sellnow", "preview", "onboarding"]);

export async function getStorefront(db: DB, workspaceId: string) {
  return db.query.storefronts.findFirst({ where: eq(storefronts.workspaceId, workspaceId) }) ?? null;
}

/**
 * Generates (or regenerates) the storefront draft through the website generator. AI writes copy
 * when configured; otherwise a clearly-labelled template is filled with the seller's own facts.
 * Never touches the live version.
 */
export async function generateStorefrontDraft(ctx: Ctx, opts: { useAI?: boolean; websiteType?: string } = {}) {
  const r = await generateWebsite(ctx, opts);
  await track(ctx.db, "storefront_generated", { workspaceId: ctx.workspaceId, props: { mode: r.mode, websiteType: r.websiteType } });
  return r;
}

/** Owner opened the generated draft — clears the dashboard "ready to explore" banner. */
export async function markDraftViewed(db: DB, workspaceId: string) {
  await db.update(storefronts).set({ viewedAt: new Date() }).where(and(eq(storefronts.workspaceId, workspaceId), isNull(storefronts.viewedAt)));
}

export async function saveDraft(ctx: Ctx, raw: { content: unknown; theme: unknown }) {
  const sf = await getStorefront(ctx.db, ctx.workspaceId);
  if (!sf) throw new AppError("errors.notFound");
  const content = normalizeContent(raw.content);
  const theme = themeSchema.parse(raw.theme);
  // Only products owned by this workspace may be referenced.
  const ids = [...content.productIds, ...(content.orderBumpProductId ? [content.orderBumpProductId] : [])];
  if (ids.length) {
    const owned = await ctx.db.select({ id: products.id }).from(products).where(and(eq(products.workspaceId, ctx.workspaceId), inArray(products.id, ids)));
    if (owned.length !== new Set(ids).size) throw new AppError("errors.forbidden");
  }
  await ctx.db.update(storefronts).set({ draftContent: content, draftTheme: theme, draftUpdatedAt: new Date() }).where(eq(storefronts.id, sf.id));
  await track(ctx.db, "storefront_edited", { workspaceId: ctx.workspaceId });
}

export async function updateSlug(ctx: Ctx, slug: string) {
  const s = slugify(slug);
  if (s.length < 3 || RESERVED_SLUGS.has(s)) throw new AppError("storefront.badSlug");
  const clash = await ctx.db.query.storefronts.findFirst({ where: eq(storefronts.slug, s) });
  if (clash && clash.workspaceId !== ctx.workspaceId) throw new AppError("storefront.slugTaken");
  await ctx.db.update(storefronts).set({ slug: s }).where(eq(storefronts.workspaceId, ctx.workspaceId));
}

export type PublishIssue = { code: string; params?: Record<string, string> };

/** Publishing validation. Returns precise, translatable issues; empty means ready. */
export async function validateForPublish(db: DB, workspaceId: string, userId: string): Promise<PublishIssue[]> {
  const issues: PublishIssue[] = [];
  const sf = await getStorefront(db, workspaceId);
  if (!sf) return [{ code: "publish.noStorefront" }];
  const ws = await db.query.workspaces.findFirst({ where: eq(workspaces.id, workspaceId) });
  const user = await db.query.users.findFirst({ where: eq(users.id, userId) });
  if (!getPlan(ws?.plan ?? "free").entitlements.publishStorefront) issues.push({ code: "publish.planRequired" });
  if (!user?.emailVerifiedAt) issues.push({ code: "publish.emailUnverified" });

  const c = sf.draftContent;
  const hero = c.sections.find((s) => s.type === "hero" && s.visible);
  if (!hero || !String(hero.props.headline ?? "").trim()) issues.push({ code: "publish.heroHeadline" });
  if (!c.productIds.length) issues.push({ code: "publish.noProducts" });

  const prods = c.productIds.length ? await db.query.products.findMany({ where: and(eq(products.workspaceId, workspaceId), inArray(products.id, c.productIds)) }) : [];
  // Enquiry-mode sites publish without online payment: buy buttons become an enquiry form.
  const enquiryOnly = c.salesMode === "enquiry";
  let needsPayment = false;
  let needsShipping = false;
  for (const p of prods) {
    const mode = enquiryOnly ? "enquiry" : ENGINES[p.type].checkout;
    if (p.status === "archived") issues.push({ code: "publish.productArchived", params: { name: p.name } });
    if (p.priceSen <= 0 && mode === "full") issues.push({ code: "publish.productPrice", params: { name: p.name } });
    if (mode === "full") needsPayment = true;
    if (p.type === "digital" && !enquiryOnly && !p.attributes.digitalAssetId) issues.push({ code: "publish.digitalFile", params: { name: p.name } });
    if (p.type === "physical") {
      if (!p.attributes.fulfillment) issues.push({ code: "publish.fulfillment", params: { name: p.name } });
      if (p.attributes.fulfillment !== "pickup" && !enquiryOnly) needsShipping = true;
      if (!enquiryOnly && p.trackStock && p.stock <= 0) issues.push({ code: "publish.outOfStock", params: { name: p.name } });
    }
  }
  if (!c.policies?.contactEmail) issues.push({ code: "publish.contactEmail" });
  if (needsPayment) {
    if (!c.policies?.refund?.trim()) issues.push({ code: "publish.refundPolicy" });
    const pay = await db.query.integrations.findFirst({
      where: and(eq(integrations.workspaceId, workspaceId), eq(integrations.kind, "payment"), eq(integrations.status, "connected")),
    });
    if (!pay) issues.push({ code: "publish.paymentNotConnected" });
  }
  if (needsShipping && !c.policies?.shipping?.trim()) issues.push({ code: "publish.shippingPolicy" });
  const proof = c.sections.find((s) => s.type === "social_proof" && s.visible);
  if (proof && (proof.props.testimonials as unknown[]).length && !proof.props.confirmed) issues.push({ code: "publish.testimonialsUnconfirmed" });
  return issues;
}

export async function publishStorefront(ctx: Ctx) {
  const sf = await getStorefront(ctx.db, ctx.workspaceId);
  if (!sf) throw new AppError("errors.notFound");
  await ctx.db.update(storefronts).set({ status: "VALIDATING" }).where(eq(storefronts.id, sf.id));
  const issues = await validateForPublish(ctx.db, ctx.workspaceId, ctx.userId);
  if (issues.length) {
    await ctx.db.update(storefronts).set({ status: sf.publishedVersionId ? "PUBLISHED" : sf.status === "VALIDATING" ? "READY_FOR_REVIEW" : sf.status }).where(eq(storefronts.id, sf.id));
    return { ok: false as const, issues };
  }
  const versionId = newId("sfv");
  const firstPublish = !sf.publishedVersionId;
  await ctx.db.transaction(async (tx) => {
    const [row] = await tx.select({ v: max(storefrontVersions.version) }).from(storefrontVersions).where(eq(storefrontVersions.storefrontId, sf.id));
    const version = (row?.v ?? 0) + 1;
    await tx.insert(storefrontVersions).values({
      id: versionId,
      workspaceId: ctx.workspaceId,
      storefrontId: sf.id,
      version,
      content: sf.draftContent,
      theme: sf.draftTheme,
      publishedBy: ctx.userId,
    });
    // Products on a published page become active.
    if (sf.draftContent.productIds.length) {
      await tx
        .update(products)
        .set({ status: "active" })
        .where(and(eq(products.workspaceId, ctx.workspaceId), inArray(products.id, sf.draftContent.productIds), eq(products.status, "draft")));
    }
    await tx.update(storefronts).set({ status: "PUBLISHED", publishedVersionId: versionId, publishedAt: new Date(), viewedAt: sf.viewedAt ?? new Date() }).where(eq(storefronts.id, sf.id));
    await audit(tx, { workspaceId: ctx.workspaceId, actorUserId: ctx.userId, action: "storefront.published", entity: "storefront", entityId: sf.id, data: { version } });
  });
  await track(ctx.db, "storefront_published", { workspaceId: ctx.workspaceId, props: { firstPublish } });
  if (firstPublish) await notify(ctx.db, ctx.workspaceId, "milestone.store_live", { slug: sf.slug });
  return { ok: true as const, slug: sf.slug, firstPublish };
}

export async function unpublishStorefront(ctx: Ctx) {
  const sf = await getStorefront(ctx.db, ctx.workspaceId);
  if (!sf) throw new AppError("errors.notFound");
  await ctx.db.update(storefronts).set({ status: "ARCHIVED" }).where(eq(storefronts.id, sf.id));
  await audit(ctx.db, { workspaceId: ctx.workspaceId, actorUserId: ctx.userId, action: "storefront.archived", entity: "storefront", entityId: sf.id });
}

/** Public read: only the published version is ever served. */
export async function getPublicStorefront(db: DB, slug: string) {
  const sf = await db.query.storefronts.findFirst({ where: eq(storefronts.slug, slug) });
  if (!sf || sf.status !== "PUBLISHED" || !sf.publishedVersionId) return null;
  const version = await db.query.storefrontVersions.findFirst({ where: eq(storefrontVersions.id, sf.publishedVersionId) });
  if (!version) return null;
  const ws = await db.query.workspaces.findFirst({ where: eq(workspaces.id, sf.workspaceId) });
  const prods = version.content.productIds.length
    ? await db.query.products.findMany({ where: and(eq(products.workspaceId, sf.workspaceId), inArray(products.id, version.content.productIds), eq(products.status, "active")) })
    : [];
  return { storefront: sf, version, workspace: ws!, products: prods };
}

export async function listVersions(db: DB, workspaceId: string) {
  return db.query.storefrontVersions.findMany({ where: eq(storefrontVersions.workspaceId, workspaceId), orderBy: desc(storefrontVersions.version), limit: 20 });
}
