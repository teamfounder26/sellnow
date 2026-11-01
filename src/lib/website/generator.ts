import { and, eq, inArray } from "drizzle-orm";
import type { DB } from "@/lib/db";
import { businessProfiles, products, storefronts, workspaces, type StorefrontContent, type StorefrontSection, type StorefrontTheme } from "@/lib/db/schema";
import { newId, slugify } from "@/lib/ids";
import { AppError } from "@/lib/errors";
import { ENGINES, type Category } from "@/lib/categories";
import { runGeneration } from "@/lib/ai/run";
import { storefrontCopySchema, type StorefrontCopyOutput } from "@/lib/ai/schemas";
import { storefrontSystem } from "@/lib/ai/prompts";
import { isAIConfigured } from "@/lib/ai/provider";
import { translate } from "@/lib/i18n/translate";
import { formatMYR } from "@/lib/money";
import { normalizeContent, section } from "@/lib/storefront/sections";
import { WEBSITE_TYPES, recommendWebsiteType, isWebsiteType, type WebsiteTypeId } from "./types";
import { buildTheme, detectDesignPreset, type DesignPresetId } from "./design";

export type GenCtx = { db: DB; workspaceId: string; userId: string; locale: "ms" | "en" };

type Product = typeof products.$inferSelect;
type Fields = Record<string, { value: unknown; status: string }>;

const val = (f: Fields, k: string) => {
  const x = f[k];
  return x && x.status !== "missing" && x.value != null && x.value !== "" ? String(x.value) : "";
};

/** Stage 1 — gather the approved business context the website is built from. */
export async function loadContext(ctx: GenCtx) {
  const ws = await ctx.db.query.workspaces.findFirst({ where: eq(workspaces.id, ctx.workspaceId) });
  const profile = await ctx.db.query.businessProfiles.findFirst({ where: eq(businessProfiles.workspaceId, ctx.workspaceId) });
  const prods = await ctx.db.query.products.findMany({ where: eq(products.workspaceId, ctx.workspaceId) });
  if (!ws || !profile) throw new AppError("errors.notFound");
  const live = prods.filter((p) => p.status !== "archived");
  if (!live.length) throw new AppError("storefront.noProducts");
  const category = (ws.category ?? live[0]!.type) as Category;
  return { ws, profile, products: live, category, name: val(profile.fields, "business_name") || ws.name };
}
type Context = Awaited<ReturnType<typeof loadContext>>;

/** Stage 2 — niche design direction + brand colours. */
export function planBrand(c: Context): { preset: DesignPresetId; theme: StorefrontTheme } {
  const f = c.profile.fields;
  const text = [c.name, val(f, "short_description"), val(f, "description"), val(f, "product_name"), val(f, "product_type"), ...c.products.map((p) => `${p.name} ${p.description}`)].join(" ");
  const preset = detectDesignPreset(c.category, text);
  return { preset, theme: buildTheme(preset, { primary: val(f, "brand_primary"), accent: val(f, "brand_accent") }) };
}

/** Stage 3 — section structure for the chosen format. */
export function planStructure(c: Context, requested?: string): { websiteType: WebsiteTypeId; blueprint: string[] } {
  let id: WebsiteTypeId = isWebsiteType(requested) ? requested : recommendWebsiteType(c.category, c.products.length).id;
  if (!WEBSITE_TYPES[id].categories.includes(c.category)) id = recommendWebsiteType(c.category, c.products.length).id;
  return { websiteType: id, blueprint: [...WEBSITE_TYPES[id].blueprint] };
}

function factsForPrompt(c: Context) {
  const f = c.profile.fields;
  return Object.entries(f)
    .filter(([, v]) => v.status !== "missing" && v.value != null && v.value !== "")
    .map(([k, v]) => `${k}: ${k === "price" || k === "shipping_fee" ? `RM${(Number(v.value) / 100).toFixed(2)}` : String(v.value)}`)
    .join("\n");
}

/** Stage 4 — copy. AI when configured (schema-validated, metered); otherwise a labelled template of the seller's own facts. */
export async function writeContent(ctx: GenCtx, c: Context, websiteType: WebsiteTypeId, useAI = true): Promise<{ mode: "ai" | "template"; copy: StorefrontCopyOutput | null }> {
  if (!useAI || !(await isAIConfigured())) return { mode: "template", copy: null };
  const main = c.products[0]!;
  const { data } = await runGeneration(ctx.db, {
    workspaceId: ctx.workspaceId,
    userId: ctx.userId,
    task: "storefront.generate",
    input: { websiteType, productIds: c.products.map((p) => p.id) },
    request: {
      system: storefrontSystem(ctx.locale),
      schema: storefrontCopySchema,
      prompt: `Approved business facts (the seller reviewed these):\n${factsForPrompt(c)}\n\nProducts:\n${c.products
        .slice(0, 12)
        .map((p) => `- ${p.name} — ${p.priceSen > 0 ? `RM${(p.priceSen / 100).toFixed(2)}` : "price not set"}`)
        .join("\n")}\nMain product: ${main.name}\nWebsite format: ${websiteType} (${WEBSITE_TYPES[websiteType].layout} page; ${WEBSITE_TYPES[websiteType].modules.join(", ")})\nWrite the website copy.`,
    },
  });
  return { mode: "ai", copy: data };
}

function detailsItems(ctx: GenCtx, c: Context, main: Product) {
  const t = (k: string) => translate(ctx.locale, k);
  const f = c.profile.fields;
  const items: { label: string; value: string }[] = [];
  const push = (labelKey: string, v: string | undefined | null) => v && items.push({ label: t(`website.details.${labelKey}`), value: v });
  push("duration", val(f, "duration") || main.attributes.serviceDuration);
  push("date", val(f, "event_date"));
  push("location", val(f, "location"));
  push("capacity", val(f, "capacity"));
  push("format", val(f, "file_format"));
  push("billing", val(f, "billing_period"));
  push("scope", val(f, "service_scope") || main.attributes.serviceScope);
  if (main.priceSen > 0) push("price", formatMYR(main.priceSen, ctx.locale));
  return items;
}

/** Stage 5 — assemble validated sections (structured data only, never generated HTML). */
export function assembleSections(ctx: GenCtx, c: Context, websiteType: WebsiteTypeId, copy: StorefrontCopyOutput | null): StorefrontSection[] {
  const t = (k: string) => translate(ctx.locale, k);
  const f = c.profile.fields;
  const type = WEBSITE_TYPES[websiteType];
  const main = c.products[0]!;
  const checkout = ENGINES[main.type].checkout;
  const buy = t(`storefront.template.cta.${type.availability === "interest" ? "unsupported" : checkout}`);
  const faqItems = c.profile.faq.map(({ q, a }) => ({ q, a }));
  const usp = val(f, "usp");
  const desc = val(f, "short_description") || val(f, "value_proposition") || main.description;
  const contactMode = type.modules.includes("interest") ? "interest" : "enquiry";

  const build: Record<string, () => StorefrontSection | null> = {
    hero: () =>
      section("hero", {
        headline: copy?.hero.headline || (type.layout === "catalog" ? c.name : main.name),
        subheadline: copy?.hero.subheadline || val(f, "tagline") || desc,
        cta: copy?.hero.cta || buy,
        imageAssetId: main.imageAssetId,
      }),
    problem_solution: () => (copy ? section("problem_solution", { problem: copy.problem, solution: copy.solution }) : section("problem_solution", { problem: "", solution: "" }, false)),
    benefits: () =>
      copy
        ? section("benefits", { title: t("storefront.template.benefitsTitle"), items: copy.benefits.slice(0, 3) })
        : section("benefits", { title: t("storefront.template.benefitsTitle"), items: usp ? [{ title: usp, body: val(f, "value_proposition") }] : [] }, Boolean(usp)),
    showcase: () => section("showcase", { title: t("storefront.template.showcaseTitle") }),
    catalog: () => section("catalog", { title: t("website.catalogTitle"), showSearch: c.products.length > 3 }),
    details: () => {
      const items = detailsItems(ctx, c, main);
      return section("details", { title: t("website.detailsTitle"), items }, items.length > 0);
    },
    offer: () =>
      copy ? section("offer", { title: copy.offer_title, body: copy.offer_body }) : section("offer", { title: val(f, "offer"), body: "" }, Boolean(val(f, "offer"))),
    pricing: () => section("pricing", { title: t("storefront.template.pricingTitle") }),
    social_proof: () => section("social_proof", { title: t("storefront.template.socialTitle"), testimonials: [], confirmed: false }, false),
    faq: () => section("faq", { title: t("storefront.template.faqTitle"), items: faqItems }, faqItems.length > 0),
    contact: () => section("contact", { title: t(`website.contact.${contactMode}Title`), body: t(`website.contact.${contactMode}Body`), mode: contactMode }),
    cta: () => section("cta", { headline: copy?.closing_headline || c.name, button: copy?.closing_cta || buy }),
  };
  return type.blueprint.map((k) => build[k]?.() ?? null).filter((s): s is StorefrontSection => s !== null);
}

/** Stages 6–7 — functional modules + schema validation of the final content. */
export function finalizeContent(c: Context, websiteType: WebsiteTypeId, sections: StorefrontSection[], prior?: StorefrontContent): StorefrontContent {
  const type = WEBSITE_TYPES[websiteType];
  const salesMode = type.modules.includes("checkout") ? (prior?.salesMode ?? "checkout") : "enquiry";
  return normalizeContent({
    sections,
    productIds: c.products.map((p) => p.id).slice(0, 20),
    seoTitle: c.name,
    policies: prior?.policies ?? { contactEmail: "" },
    orderBumpProductId: null,
    websiteType,
    salesMode,
  });
}

export async function uniqueStoreSlug(db: DB, name: string) {
  const RESERVED = new Set(["api", "admin", "dashboard", "login", "signup", "s", "pay", "app", "www", "help", "sellnow", "preview", "onboarding"]);
  const base0 = slugify(name);
  const base = RESERVED.has(base0) ? `${base0}-store` : base0;
  for (let i = 0; i < 50; i++) {
    const slug = i === 0 ? base : `${base}-${i + 1}`;
    if (!(await db.query.storefronts.findFirst({ where: eq(storefronts.slug, slug) }))) return slug;
  }
  return `${base}-${Date.now().toString(36)}`;
}

/** Stage 8 — persist the draft. Never touches the published version. */
export async function saveGeneratedDraft(ctx: GenCtx, c: Context, content: StorefrontContent, theme: StorefrontTheme, jobId?: string) {
  const existing = await ctx.db.query.storefronts.findFirst({ where: eq(storefronts.workspaceId, ctx.workspaceId) });
  const status = existing?.publishedVersionId ? "PUBLISHED" : "READY_FOR_REVIEW";
  if (existing) {
    await ctx.db
      .update(storefronts)
      .set({ draftContent: content, draftTheme: theme, status, websiteType: content.websiteType, lastGenerationJobId: jobId ?? null, draftUpdatedAt: new Date(), viewedAt: null })
      .where(eq(storefronts.id, existing.id));
    return existing.id;
  }
  const id = newId("sf");
  await ctx.db.insert(storefronts).values({
    id,
    workspaceId: ctx.workspaceId,
    slug: await uniqueStoreSlug(ctx.db, c.name),
    draftContent: content,
    draftTheme: theme,
    status,
    websiteType: content.websiteType,
    lastGenerationJobId: jobId ?? null,
  });
  return id;
}

/** All stages in one call (dashboard "regenerate", tests). The onboarding LAUNCH job runs the same stages durably. */
export async function generateWebsite(ctx: GenCtx, opts: { websiteType?: string; useAI?: boolean } = {}) {
  const c = await loadContext(ctx);
  const brand = planBrand(c);
  const { websiteType } = planStructure(c, opts.websiteType ?? (await currentWebsiteType(ctx)));
  const { mode, copy } = await writeContent(ctx, c, websiteType, opts.useAI ?? true);
  const existing = await ctx.db.query.storefronts.findFirst({ where: eq(storefronts.workspaceId, ctx.workspaceId) });
  const content = finalizeContent(c, websiteType, assembleSections(ctx, c, websiteType, copy), existing?.draftContent);
  await saveGeneratedDraft(ctx, c, content, brand.theme);
  return { mode, websiteType };
}

async function currentWebsiteType(ctx: GenCtx) {
  const sf = await ctx.db.query.storefronts.findFirst({ where: eq(storefronts.workspaceId, ctx.workspaceId) });
  return sf?.websiteType ?? undefined;
}

/** Products referenced by a content draft, scoped to the workspace. */
export async function productsFor(db: DB, workspaceId: string, ids: string[]) {
  return ids.length ? db.query.products.findMany({ where: and(eq(products.workspaceId, workspaceId), inArray(products.id, ids)) }) : [];
}
