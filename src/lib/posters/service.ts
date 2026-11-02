import { and, asc, desc, eq, inArray, lt, sql } from "drizzle-orm";
import { z } from "zod";
import type { DB } from "@/lib/db";
import {
  adInsightsDaily,
  ads,
  aiCreditLedger,
  aiGenerations,
  assets,
  businessProfiles,
  posterProjects,
  posterVersions,
  posters,
  products,
  storefronts,
  type PosterBrief,
  type PosterConcept,
  type PosterCopy,
  type PosterFact,
  type PosterIntel,
  type PosterObjective,
  type PosterSettings,
  type PosterSource,
  type PosterStyle,
  type PosterTheme,
} from "@/lib/db/schema";
import { runGeneration } from "@/lib/ai/run";
import { isAIConfigured } from "@/lib/ai/provider";
import { AIProviderError } from "@/lib/ai/provider";
import { generateImage, imageGenerationConfigured, imageProviderInfo } from "@/lib/ai/image";
import { CREDIT_COSTS } from "@/lib/billing/plans";
import { creditBalance, lockWorkspace, refundGeneration } from "@/lib/billing/credits";
import { availableObjectives, confirmedTestimonials } from "@/lib/ads/strategy";
import { createDraft, updateDraft } from "@/lib/ads/service";
import { storeImageBytes } from "@/lib/storage";
import { newId } from "@/lib/ids";
import { AppError } from "@/lib/errors";
import { log } from "@/lib/log";
import { POSTER_ANGLES, POSTER_OBJECTIVES, POSTER_RATIOS, POSTER_STYLES, POSTER_THEMES, ctaFor } from "./options";
import { THEME_RULES, compilePrompts } from "./prompt";

export type Ctx = { db: DB; workspaceId: string; userId: string; locale: "ms" | "en" };
type Product = typeof products.$inferSelect;
export type Project = typeof posterProjects.$inferSelect;
export type Poster = typeof posters.$inferSelect;
export type PosterVersion = typeof posterVersions.$inferSelect;

/** A "generating" version older than this is treated as abandoned (failed + refunded). */
const STALE_MS = 6 * 60_000;
const s = (max: number) => z.string().trim().max(max);

export const settingsSchema = z.object({
  objective: z.enum(["auto", ...POSTER_OBJECTIVES] as [string, ...string[]]),
  theme: z.enum(["auto", ...POSTER_THEMES] as [string, ...string[]]),
  angle: z.enum(["auto", ...POSTER_ANGLES] as [string, ...string[]]),
  style: z.enum(["auto", ...POSTER_STYLES] as [string, ...string[]]),
  ratio: z.enum(POSTER_RATIOS as [string, ...string[]]),
  language: z.enum(["ms", "en", "mixed"]),
  variations: z.union([z.literal(1), z.literal(3), z.literal(5)]),
  advanced: z
    .object({
      audience: s(300).optional(),
      problem: s(300).optional(),
      motivation: s(300).optional(),
      awareness: z.enum(["unaware", "problem", "solution", "product", "most"]).optional(),
      keyMessage: s(300).optional(),
      offer: s(300).optional(),
      showPrice: z.boolean().optional(),
      proofPoints: s(600).optional(),
      customCta: s(30).optional(),
      logoAssetId: z.string().max(40).nullable().optional(),
      brandColors: z.array(z.string().regex(/^#[0-9a-fA-F]{6}$/)).max(4).optional(),
      fontPreference: s(60).optional(),
      referenceAssetIds: z.array(z.string().max(40)).max(4).optional(),
      restrictions: s(400).optional(),
      layout: s(120).optional(),
      textDensity: z.enum(["light", "balanced", "rich"]).optional(),
      background: s(120).optional(),
      testimonial: z.object({ quote: s(400).min(3), author: s(80).min(1), permission: z.boolean() }).nullable().optional(),
    })
    .default({}),
});

const copySchema = z.object({ headline: s(90).min(2), body: z.array(s(140).min(1)).max(4), cta: s(30).min(2) });
const conceptSchema = z.object({
  theme: z.enum(POSTER_THEMES as [PosterTheme, ...PosterTheme[]]),
  angle: z.enum(POSTER_ANGLES as [string, ...string[]]),
  keyMessage: s(300),
  copy: copySchema,
  visual: z.object({ style: z.enum(POSTER_STYLES as [PosterStyle, ...PosterStyle[]]), hero: s(300), supporting: z.array(s(200)).max(5), layout: s(200), colors: z.array(s(40)).max(5) }),
  testimonialIndex: z.number().int().min(0).nullable().optional(),
});
export const briefSchema = z.object({
  product: z.object({ name: s(160).min(1), priceSen: z.number().int().min(0), mainBenefit: s(300) }),
  audience: z.object({ customer: s(300), problem: s(300), motivation: s(300) }),
  strategy: z.object({ objective: z.enum(POSTER_OBJECTIVES as [PosterObjective, ...PosterObjective[]]), recommendation: s(1200) }),
  concepts: z.array(conceptSchema).min(1).max(5),
  evidence: z.object({ facts: z.array(s(300)).max(20), claims: z.array(s(300)).max(10), testimonials: z.array(z.object({ quote: s(400), author: s(80) })).max(10) }),
  sources: z.record(z.string(), z.enum(["product", "profile", "storefront", "user", "ai"])),
});
export const intelSchema = z.object({
  facts: z.array(z.object({ label: s(60), value: s(600), source: z.enum(["product", "profile", "storefront", "user", "ai"]) })).max(30),
  what: s(400),
  who: s(400),
  problem: s(400),
  solution: s(400),
  benefits: z.array(s(200)).max(6),
  usp: s(300),
  evidence: z.array(s(300)).max(10),
  assumptions: z.array(s(300)).max(10),
  questions: z.array(s(200)).max(3),
});

// ------------------------------------------------------------------ Step 1: product intelligence

const money = (sen: number) => `RM${(sen / 100).toFixed(2)}`;

/** Verified facts only — straight from the seller's product, approved profile and storefront. */
export async function productFacts(db: DB, workspaceId: string, p: Product, settings?: PosterSettings) {
  const [profile, sf, quotes, avail] = await Promise.all([
    db.query.businessProfiles.findFirst({ where: eq(businessProfiles.workspaceId, workspaceId) }),
    db.query.storefronts.findFirst({ where: eq(storefronts.workspaceId, workspaceId) }),
    confirmedTestimonials(db, workspaceId),
    availableObjectives(db, workspaceId, p),
  ]);
  const facts: PosterFact[] = [
    { label: "name", value: p.name, source: "product" },
    { label: "price", value: money(p.priceSen), source: "product" },
    { label: "category", value: p.type, source: "product" },
  ];
  if (p.description) facts.push({ label: "description", value: p.description, source: "product" });
  if (p.collection) facts.push({ label: "collection", value: p.collection, source: "product" });
  const confirmed = (k: string) => {
    const f = profile?.fields[k];
    return f && (f.status === "confirmed" || f.status === "user") && f.value != null && f.value !== "" ? String(f.value) : null;
  };
  // Profile fields already covered by the product record (or used as brand colours) aren't repeated.
  const skip = new Set(["price", "name", "product_name", "category", "description", "brand_primary", "brand_accent"]);
  for (const k of Object.keys(profile?.fields ?? {})) {
    const v = confirmed(k);
    if (!v || skip.has(k) || facts.some((f) => f.value.trim().toLowerCase() === v.trim().toLowerCase())) continue;
    facts.push({ label: k, value: v.slice(0, 600), source: "profile" });
  }
  if (sf?.publishedVersionId) facts.push({ label: "landing_page", value: `/s/${sf.slug}`, source: "storefront" });
  const testimonials = quotes.map((q) => ({ quote: q.quote, author: q.author }));
  const own = settings?.advanced.testimonial;
  if (own?.permission) testimonials.push({ quote: own.quote, author: own.author });
  const adv = settings?.advanced ?? {};
  if (adv.offer) facts.push({ label: "offer", value: adv.offer, source: "user" });
  if (adv.proofPoints) facts.push({ label: "proof", value: adv.proofPoints, source: "user" });
  if (adv.keyMessage) facts.push({ label: "key_message", value: adv.keyMessage, source: "user" });
  const theme = sf?.draftTheme;
  const hex = (c: string | null | undefined): c is string => Boolean(c && /^#[0-9a-fA-F]{6}$/.test(c));
  const fromProfile = [confirmed("brand_primary"), confirmed("brand_accent")].filter(hex);
  const fromTheme = theme ? [theme.primary, theme.accent].filter(hex) : [];
  const brandColors = adv.brandColors?.length ? adv.brandColors : fromProfile.length ? fromProfile : fromTheme.length ? fromTheme : ["#1F83D8"];
  // A short, relevant question when there's nothing to base benefits on.
  const missing = !p.description && !facts.some((f) => f.source === "profile" && /benefit|feature|usp|description/i.test(f.label)) && !adv.keyMessage ? ["describe"] : [];
  return { facts, testimonials, brandColors, avail, missing };
}

function allowedObjectives(avail: Awaited<ReturnType<typeof availableObjectives>>): PosterObjective[] {
  return POSTER_OBJECTIVES.filter((o) => (o === "sales" ? avail.sales : o === "traffic" || o === "leads" ? avail.live : true));
}

function languageLine(l: PosterSettings["language"]) {
  return l === "ms" ? "Bahasa Melayu (Malaysia)" : l === "en" ? "English" : "a natural Malaysian mix of Bahasa Melayu and English (mostly BM, common English words where Malaysians use them)";
}

// ------------------------------------------------------------------ Step 3: AI creative brief

const aiBriefSchema = z.object({
  intel: z.object({
    what: z.string(),
    who: z.string(),
    problem: z.string(),
    solution: z.string(),
    benefits: z.array(z.string()).describe("Only benefits stated in or directly implied by the facts"),
    usp: z.string().describe('Strongest differentiator from the facts, or "" if the facts do not support one'),
    evidence: z.array(z.string()).describe("Exact facts that support the claims above"),
    assumptions: z.array(z.string()).describe("Anything you inferred that is NOT in the facts"),
    questions: z.array(z.string()).describe("At most 2 short questions if essential info is missing"),
  }),
  audience: z.object({ customer: z.string(), problem: z.string(), motivation: z.string() }),
  objective: z.enum(POSTER_OBJECTIVES as [PosterObjective, ...PosterObjective[]]),
  recommendation: z.string().describe("2–3 sentences: which themes/angles to test and why, grounded in the facts and past results; never promise results"),
  main_benefit: z.string(),
  claims: z.array(z.string()).describe("Promotional claims supported by the facts (offers only if stated)"),
  concepts: z.array(
    z.object({
      theme: z.enum(POSTER_THEMES as [PosterTheme, ...PosterTheme[]]),
      angle: z.enum(POSTER_ANGLES as [string, ...string[]]),
      style: z.enum(POSTER_STYLES as [PosterStyle, ...PosterStyle[]]),
      key_message: z.string(),
      headline: z.string().describe("4–7 words, clear before clever"),
      body: z.array(z.string()).describe("2–4 short scannable phrases matching the theme (testimonial: 0–2)"),
      cta: z.string(),
      hero: z.string().describe("Main hero visual"),
      supporting: z.array(z.string()).describe("One illustration per body point, describing what it shows"),
      layout: z.string(),
      colors: z.array(z.string()),
      testimonial_index: z.number().int().describe("Index of the verified testimonial used, or -1"),
    }),
  ),
});

async function pastPerformance(db: DB, workspaceId: string) {
  const rows = await db
    .select({ theme: posters.theme, angle: posters.angle, spend: sql<number>`coalesce(sum(${adInsightsDaily.spendSen}),0)::int`, purchases: sql<number>`coalesce(sum(${adInsightsDaily.purchases}),0)::int`, revenue: sql<number>`coalesce(sum(${adInsightsDaily.revenueSen}),0)::int` })
    .from(posters)
    .innerJoin(adInsightsDaily, eq(adInsightsDaily.adId, posters.adId))
    .where(eq(posters.workspaceId, workspaceId))
    .groupBy(posters.theme, posters.angle);
  return rows.filter((r) => r.spend > 0).map((r) => `${r.theme}/${r.angle}: spend ${money(r.spend)}, purchases ${r.purchases}, CPP ${r.purchases ? money(Math.round(r.spend / r.purchases)) : "n/a"}, ROAS ${(r.revenue / r.spend).toFixed(2)}`);
}

/** Forces the seller's explicit choices and the truth rules onto whatever the model returned. */
function normaliseConcepts(raw: z.infer<typeof aiBriefSchema>["concepts"], settings: PosterSettings, testimonials: { quote: string }[], cta: string): PosterConcept[] {
  const out: PosterConcept[] = [];
  for (const c of raw.slice(0, settings.variations)) {
    let theme = settings.theme !== "auto" ? settings.theme : c.theme;
    let tIdx: number | null = c.testimonial_index >= 0 && c.testimonial_index < testimonials.length ? c.testimonial_index : null;
    if (theme === "testimonial" && tIdx == null) {
      if (testimonials.length) tIdx = out.filter((x) => x.theme === "testimonial").length % testimonials.length;
      else theme = "usp";
    }
    out.push({
      theme,
      angle: (settings.angle !== "auto" ? settings.angle : c.angle) as PosterConcept["angle"],
      keyMessage: c.key_message.slice(0, 300),
      copy: { headline: c.headline.trim().slice(0, 90), body: c.body.map((b) => b.trim()).filter(Boolean).slice(0, 4).map((b) => b.slice(0, 140)), cta: (settings.advanced.customCta || c.cta || cta).slice(0, 30) },
      visual: { style: settings.style !== "auto" ? (settings.style as PosterStyle) : c.style, hero: c.hero.slice(0, 300), supporting: c.supporting.slice(0, 4).map((x) => x.slice(0, 200)), layout: c.layout.slice(0, 200), colors: c.colors.slice(0, 4) },
      testimonialIndex: theme === "testimonial" ? tIdx : null,
    });
  }
  return out;
}

/** Rule-based brief from the seller's own facts (manual mode — no AI configured). Everything is editable. */
function rulesBrief(p: Product, settings: PosterSettings, objective: PosterObjective, testimonials: { quote: string; author: string }[], cta: string, facts: PosterFact[]): { intel: PosterIntel; brief: PosterBrief } {
  const sentences = (p.description || "").split(/(?<=[.!?])\s+|\n+/).map((x) => x.trim()).filter(Boolean);
  const body = sentences.slice(0, 3).map((x) => x.slice(0, 140));
  const concepts: PosterConcept[] = [];
  const themes: PosterTheme[] = settings.theme !== "auto" ? [settings.theme] : testimonials.length ? ["features", "usp", "testimonial"] : ["features", "usp"];
  for (let i = 0; i < settings.variations; i++) {
    const theme = themes[i % themes.length]!;
    concepts.push({
      theme,
      angle: (settings.angle !== "auto" ? settings.angle : theme === "testimonial" ? "benefits" : "direct") as PosterConcept["angle"],
      keyMessage: settings.advanced.keyMessage || p.name,
      copy: { headline: p.name.split(/\s+/).slice(0, 7).join(" "), body: theme === "testimonial" ? [] : body, cta: settings.advanced.customCta || cta },
      visual: { style: settings.style !== "auto" ? (settings.style as PosterStyle) : "fluent_3d", hero: p.name, supporting: theme === "testimonial" ? [] : body, layout: THEME_RULES[theme].layouts.split(",")[0]!, colors: [] },
      testimonialIndex: theme === "testimonial" ? i % Math.max(1, testimonials.length) : null,
    });
  }
  const intel: PosterIntel = { facts, what: sentences[0] ?? p.name, who: settings.advanced.audience ?? "", problem: settings.advanced.problem ?? "", solution: "", benefits: body, usp: "", evidence: facts.map((f) => `${f.label}: ${f.value}`).slice(0, 10), assumptions: [], questions: [] };
  const brief: PosterBrief = {
    product: { name: p.name, priceSen: p.priceSen, mainBenefit: sentences[0] ?? "" },
    audience: { customer: settings.advanced.audience ?? "", problem: settings.advanced.problem ?? "", motivation: settings.advanced.motivation ?? "" },
    strategy: { objective, recommendation: "" },
    concepts,
    evidence: { facts: intel.evidence, claims: settings.advanced.offer ? [settings.advanced.offer] : [], testimonials },
    sources: { "product.name": "product", "product.priceSen": "product", "product.mainBenefit": "product", "audience.customer": "user", "audience.problem": "user", "audience.motivation": "user", concepts: "product" },
  };
  return { intel, brief };
}

async function buildBrief(ctx: Ctx, p: Product, settings: PosterSettings, intelOverride?: PosterIntel) {
  const { facts, testimonials, avail, brandColors } = await productFacts(ctx.db, ctx.workspaceId, p, settings);
  // Brand colours default from the storefront theme; the seller can change them in Advanced Settings.
  if (!settings.advanced.brandColors?.length) settings.advanced = { ...settings.advanced, brandColors };
  const allowed = allowedObjectives(avail);
  const ruleObjective: PosterObjective = settings.objective !== "auto" && allowed.includes(settings.objective as PosterObjective) ? (settings.objective as PosterObjective) : avail.sales ? "sales" : avail.live ? "traffic" : "awareness";
  if (settings.objective !== "auto" && !allowed.includes(settings.objective as PosterObjective)) throw new AppError("posters.objectiveUnavailable");
  if (settings.theme === "testimonial" && testimonials.length === 0) throw new AppError("posters.noTestimonials");

  if (!(await isAIConfigured())) {
    const cta = ctaFor(ruleObjective, settings.language, avail.sales);
    return { ...rulesBrief(p, settings, ruleObjective, testimonials, cta, facts), by: "rules" as const, generationId: null };
  }

  const adv = settings.advanced;
  const sellerNotes = [
    adv.audience && `target audience: ${adv.audience}`,
    adv.problem && `customer problem: ${adv.problem}`,
    adv.motivation && `buying motivation: ${adv.motivation}`,
    adv.awareness && `awareness level: ${adv.awareness}`,
    adv.layout && `layout preference: ${adv.layout}`,
    adv.textDensity && `text density: ${adv.textDensity}`,
    adv.background && `background style: ${adv.background}`,
    adv.restrictions && `visual restrictions: ${adv.restrictions}`,
  ].filter(Boolean);
  const editedIntel = intelOverride
    ? `\n\nSeller-reviewed product intelligence (treat as confirmed by the seller):\n${JSON.stringify({ what: intelOverride.what, who: intelOverride.who, problem: intelOverride.problem, solution: intelOverride.solution, benefits: intelOverride.benefits, usp: intelOverride.usp })}`
    : "";
  const perf = await pastPerformance(ctx.db, ctx.workspaceId);
  const n = settings.variations;
  const { data, generationId } = await runGeneration(ctx.db, {
    workspaceId: ctx.workspaceId,
    userId: ctx.userId,
    task: "poster.brief",
    input: { productId: p.id, settings },
    request: {
      system: `You are a performance marketing strategist, direct-response copywriter and creative director creating Meta Ads posters for a Malaysian SME. Strategy first, design second.
Rules:
- Use ONLY the facts given. Never invent benefits, features, medical/health claims, results, testimonials, ratings, discounts, guarantees or certifications. Put anything you infer in intel.assumptions.
- Objective: ${settings.objective === "auto" ? `recommend one of ${allowed.join(", ")}` : `"${settings.objective}"`} (only ${allowed.join(", ")} are possible now; "sales" needs a working checkout).
- Produce exactly ${n} concept(s). Each concept has ONE clear theme: ${POSTER_THEMES.map((t) => `${t} (${THEME_RULES[t].structure})`).join("; ")}.
${settings.theme === "auto" ? `- Pick the best theme per concept; with several concepts, test genuinely different themes/angles, not near-duplicates.${testimonials.length ? "" : ' No verified testimonials exist, so never use the "testimonial" theme.'}` : `- Theme for every concept: ${settings.theme}; vary the angle or visual composition between concepts.`}
${settings.angle === "auto" ? "- Pick the marketing angle per concept." : `- Marketing angle: ${settings.angle}.`}
${settings.style === "auto" ? "- Pick the illustration style per concept." : `- Illustration style: ${settings.style}.`}
- Headline: prefer 4–7 words; capture attention with a problem, benefit, curiosity or simple solution; natural language; no hype.
- Body: 2–4 short phrases (no paragraphs). Every supporting illustration must depict its matching body point.
- Testimonial concepts: quote nothing yourself — set testimonial_index to the verified testimonial used; body 0–2 short context phrases.
- CTA fits the objective and destination${avail.sales ? "" : " (no online checkout: avoid 'Shop Now')"}.${adv.customCta ? ` Use this CTA: "${adv.customCta}".` : ""}
- Recommendation: like an experienced creative strategist, say which themes to test and why; ground it in the facts${perf.length ? " and the past ad results given" : ""}; never promise conversions.
Write all customer-facing text in ${languageLine(settings.language)}.`,
      schema: aiBriefSchema,
      maxTokens: 900 + n * 450,
      prompt: `Verified facts:\n${facts.map((f) => `${f.label}: ${f.value}`).join("\n")}${testimonials.length ? `\n\nVerified testimonials (index: quote — author):\n${testimonials.map((t, i) => `${i}: "${t.quote}" — ${t.author}`).join("\n")}` : ""}${sellerNotes.length ? `\n\nSeller's notes:\n${sellerNotes.join("\n")}` : ""}${editedIntel}${perf.length ? `\n\nPast poster ad results (real Meta data):\n${perf.join("\n")}` : ""}\n\nCreate the product intelligence summary and the creative brief.`,
    },
  });
  const objective = settings.objective !== "auto" ? (settings.objective as PosterObjective) : allowed.includes(data.objective) ? data.objective : ruleObjective;
  const concepts = normaliseConcepts(data.concepts, settings, testimonials, ctaFor(objective, settings.language, avail.sales));
  if (!concepts.length) throw new AppError("ai.invalidOutput");
  const intel: PosterIntel = intelOverride
    ? { ...intelOverride, facts }
    : { facts, what: data.intel.what, who: data.intel.who, problem: data.intel.problem, solution: data.intel.solution, benefits: data.intel.benefits.slice(0, 6), usp: data.intel.usp, evidence: data.intel.evidence.slice(0, 10), assumptions: data.intel.assumptions.slice(0, 10), questions: data.intel.questions.slice(0, 2) };
  const fromUser = (v?: string): PosterSource => (v ? "user" : "ai");
  const brief: PosterBrief = {
    product: { name: p.name, priceSen: p.priceSen, mainBenefit: data.main_benefit },
    audience: { customer: adv.audience || data.audience.customer, problem: adv.problem || data.audience.problem, motivation: adv.motivation || data.audience.motivation },
    strategy: { objective, recommendation: data.recommendation },
    concepts,
    evidence: { facts: facts.map((f) => `${f.label}: ${f.value}`).slice(0, 20), claims: data.claims.slice(0, 10), testimonials },
    sources: { "product.name": "product", "product.priceSen": "product", "product.mainBenefit": "ai", "audience.customer": fromUser(adv.audience), "audience.problem": fromUser(adv.problem), "audience.motivation": fromUser(adv.motivation), "strategy.objective": settings.objective === "auto" ? "ai" : "user", concepts: "ai" },
  };
  return { intel, brief, by: "ai" as const, generationId };
}

async function ownedProduct(db: DB, workspaceId: string, productId: string) {
  const p = await db.query.products.findFirst({ where: and(eq(products.id, productId), eq(products.workspaceId, workspaceId)) });
  if (!p) throw new AppError("errors.notFound");
  return p;
}

export async function getProject(db: DB, workspaceId: string, id: string) {
  const pr = await db.query.posterProjects.findFirst({ where: and(eq(posterProjects.id, id), eq(posterProjects.workspaceId, workspaceId)) });
  if (!pr) throw new AppError("errors.notFound");
  return pr;
}

/** Fast checks run before queueing a brief job, so the seller sees problems immediately. */
export async function validateBriefRequest(ctx: Ctx, raw: { productId?: string; projectId?: string; settings?: unknown; intel?: unknown }) {
  const pr = raw.projectId ? await getProject(ctx.db, ctx.workspaceId, raw.projectId) : null;
  const productId = pr?.productId ?? raw.productId;
  if (!productId) throw new AppError("errors.notFound");
  const p = await ownedProduct(ctx.db, ctx.workspaceId, productId);
  const settings = (raw.settings ? settingsSchema.parse(raw.settings) : pr!.settings) as PosterSettings;
  if (raw.intel) intelSchema.parse(raw.intel);
  await assertOwnAssets(ctx, settings);
  const { testimonials, avail } = await productFacts(ctx.db, ctx.workspaceId, p, settings);
  if (settings.theme === "testimonial" && testimonials.length === 0) throw new AppError("posters.noTestimonials");
  if (settings.objective !== "auto" && !allowedObjectives(avail).includes(settings.objective as PosterObjective)) throw new AppError("posters.objectiveUnavailable");
  if (await isAIConfigured()) {
    const balance = await creditBalance(ctx.db, ctx.workspaceId);
    if (balance < CREDIT_COSTS["poster.brief"]) throw new AppError("credits.insufficient", { balance, cost: CREDIT_COSTS["poster.brief"] });
  }
}

export async function createProject(ctx: Ctx, raw: { productId: string; settings: unknown; id?: string }) {
  // A resumed job passes the same id: the project is created once, never twice.
  if (raw.id && (await ctx.db.query.posterProjects.findFirst({ where: and(eq(posterProjects.id, raw.id), eq(posterProjects.workspaceId, ctx.workspaceId)) }))) return raw.id;
  const settings = settingsSchema.parse(raw.settings) as PosterSettings;
  const p = await ownedProduct(ctx.db, ctx.workspaceId, raw.productId);
  await assertOwnAssets(ctx, settings);
  const { intel, brief, by, generationId } = await buildBrief(ctx, p, settings);
  const id = raw.id ?? newId("ppj");
  await ctx.db.insert(posterProjects).values({ id, workspaceId: ctx.workspaceId, productId: p.id, settings, intel, brief, briefBy: by, generationId, createdBy: ctx.userId });
  return id;
}

/** "Regenerate Strategy": rebuilds the brief from (optionally edited) settings and intelligence. Needs re-approval. */
export async function regenerateBrief(ctx: Ctx, projectId: string, raw: { settings?: unknown; intel?: unknown }) {
  const pr = await getProject(ctx.db, ctx.workspaceId, projectId);
  if (!pr.productId) throw new AppError("errors.notFound");
  const settings = (raw.settings ? settingsSchema.parse(raw.settings) : pr.settings) as PosterSettings;
  await assertOwnAssets(ctx, settings);
  const intel = raw.intel ? (intelSchema.parse(raw.intel) as PosterIntel) : undefined;
  const p = await ownedProduct(ctx.db, ctx.workspaceId, pr.productId);
  const out = await buildBrief(ctx, p, settings, intel);
  await ctx.db.update(posterProjects).set({ settings, intel: out.intel, brief: out.brief, briefBy: out.by, generationId: out.generationId, status: "brief", approvedAt: null, approvedBy: null, updatedAt: new Date() }).where(eq(posterProjects.id, pr.id));
}

async function assertOwnAssets(ctx: Ctx, settings: PosterSettings) {
  const ids = [settings.advanced.logoAssetId, ...(settings.advanced.referenceAssetIds ?? [])].filter((x): x is string => Boolean(x));
  if (!ids.length) return;
  const rows = await ctx.db.select({ id: assets.id }).from(assets).where(and(eq(assets.workspaceId, ctx.workspaceId), inArray(assets.id, ids), eq(assets.kind, "image")));
  if (rows.length !== new Set(ids).size) throw new AppError("errors.forbidden");
}

/** Seller edits to the brief. Edited text is marked as the seller's; any edit after approval requires approving again. */
export async function updateBrief(ctx: Ctx, projectId: string, raw: unknown) {
  const pr = await getProject(ctx.db, ctx.workspaceId, projectId);
  const next = briefSchema.parse(raw) as PosterBrief;
  // Facts the seller can't change here: product identity, price and the verified testimonials list.
  next.product.name = pr.brief.product.name;
  next.product.priceSen = pr.brief.product.priceSen;
  next.evidence.testimonials = pr.brief.evidence.testimonials;
  const sources = { ...pr.brief.sources };
  const changed = (a: unknown, b: unknown) => JSON.stringify(a) !== JSON.stringify(b);
  if (changed(next.product.mainBenefit, pr.brief.product.mainBenefit)) sources["product.mainBenefit"] = "user";
  for (const k of ["customer", "problem", "motivation"] as const) if (changed(next.audience[k], pr.brief.audience[k])) sources[`audience.${k}`] = "user";
  if (changed(next.strategy.objective, pr.brief.strategy.objective)) sources["strategy.objective"] = "user";
  next.concepts.forEach((c, i) => {
    if (changed(c, pr.brief.concepts[i])) sources[`concepts.${i}`] = "user";
    if (c.theme === "testimonial" && (c.testimonialIndex == null || !next.evidence.testimonials[c.testimonialIndex])) throw new AppError("posters.noTestimonials");
    if (c.theme !== "testimonial") c.testimonialIndex = null;
  });
  next.sources = sources;
  if (next.strategy.objective !== pr.brief.strategy.objective) {
    const p = pr.productId ? await ownedProduct(ctx.db, ctx.workspaceId, pr.productId) : null;
    if (p && !allowedObjectives(await availableObjectives(ctx.db, ctx.workspaceId, p)).includes(next.strategy.objective)) throw new AppError("posters.objectiveUnavailable");
  }
  await ctx.db.update(posterProjects).set({ brief: next, status: "brief", approvedAt: null, approvedBy: null, updatedAt: new Date() }).where(eq(posterProjects.id, pr.id));
}

// ------------------------------------------------------------------ Step 4–5: approval → prompts

export function briefProblems(b: PosterBrief) {
  const problems: { concept: number; code: string }[] = [];
  b.concepts.forEach((c, i) => {
    if (!c.copy.headline.trim()) problems.push({ concept: i, code: "headline" });
    if (!c.copy.cta.trim()) problems.push({ concept: i, code: "cta" });
    if (c.theme !== "testimonial" && (c.copy.body.length < 2 || c.copy.body.length > 4)) problems.push({ concept: i, code: "body" });
    if (c.theme === "testimonial" && (c.testimonialIndex == null || !b.evidence.testimonials[c.testimonialIndex])) problems.push({ concept: i, code: "testimonial" });
    if (!c.visual.hero.trim()) problems.push({ concept: i, code: "visual" });
  });
  return problems;
}

function promptsFor(pr: Project, c: PosterConcept, style?: PosterStyle) {
  const adv = pr.settings.advanced;
  const concept = style ? { ...c, visual: { ...c.visual, style } } : c;
  const brandColors = adv.brandColors?.length ? adv.brandColors : c.visual.colors;
  return compilePrompts(pr.brief, concept, { ratio: pr.settings.ratio, brandColors, showPrice: adv.showPrice !== false, priceLabel: money(pr.brief.product.priceSen), restrictions: adv.restrictions, font: adv.fontPreference });
}

/**
 * Approval locks the brief and compiles one poster (with its prompts) per concept. No image credits
 * are spent here. Re-approving after edits refreshes posters that haven't been hand-edited.
 */
export async function approveBrief(ctx: Ctx, projectId: string) {
  const pr = await getProject(ctx.db, ctx.workspaceId, projectId);
  const problems = briefProblems(pr.brief);
  if (problems.length) throw new AppError("posters.briefIncomplete", { n: problems[0]!.concept + 1 });
  const existing = await ctx.db.query.posters.findMany({ where: eq(posters.projectId, pr.id) });
  await ctx.db.transaction(async (tx) => {
    for (const [i, c] of pr.brief.concepts.entries()) {
      const prev = existing.find((x) => x.idx === i);
      const compiled = promptsFor(pr, c);
      if (prev) {
        await tx
          .update(posters)
          .set({ theme: c.theme, angle: c.angle, style: c.visual.style, ratio: pr.settings.ratio, copy: c.copy, ...(prev.promptEdited ? {} : compiled), updatedAt: new Date() })
          .where(eq(posters.id, prev.id));
      } else {
        await tx.insert(posters).values({ id: newId("pst"), workspaceId: ctx.workspaceId, projectId: pr.id, productId: pr.productId, idx: i, theme: c.theme, angle: c.angle, style: c.visual.style, ratio: pr.settings.ratio, copy: c.copy, ...compiled });
      }
    }
    await tx.update(posterProjects).set({ status: "approved", approvedAt: new Date(), approvedBy: ctx.userId, updatedAt: new Date() }).where(eq(posterProjects.id, pr.id));
  });
}

async function ownedPoster(db: DB, workspaceId: string, id: string) {
  const p = await db.query.posters.findFirst({ where: and(eq(posters.id, id), eq(posters.workspaceId, workspaceId)) });
  if (!p) throw new AppError("errors.notFound");
  return p;
}

export async function updatePrompt(ctx: Ctx, posterId: string, raw: { prompt: string }) {
  const p = await ownedPoster(ctx.db, ctx.workspaceId, posterId);
  const prompt = z.string().trim().min(20).max(8000).parse(raw.prompt);
  await ctx.db.update(posters).set({ prompt, promptEdited: true, updatedAt: new Date() }).where(eq(posters.id, p.id));
}

// ------------------------------------------------------------------ Step 5–6: images, versions, edits

async function nextVersion(db: DB, posterId: string) {
  const [row] = await db.select({ v: sql<number>`coalesce(max(${posterVersions.version}),0)::int` }).from(posterVersions).where(eq(posterVersions.posterId, posterId));
  return Number(row?.v ?? 0) + 1;
}

/** Abandoned generations (server restart mid-call) are failed and refunded under the normal policy. */
export async function reapStaleVersions(db: DB, workspaceId: string) {
  const stale = await db.query.posterVersions.findMany({ where: and(eq(posterVersions.workspaceId, workspaceId), eq(posterVersions.status, "generating"), lt(posterVersions.createdAt, new Date(Date.now() - STALE_MS))) });
  for (const v of stale) {
    await db.update(posterVersions).set({ status: "failed", error: "ai.timeout", completedAt: new Date() }).where(and(eq(posterVersions.id, v.id), eq(posterVersions.status, "generating")));
    if (v.generationId) {
      await db.update(aiGenerations).set({ status: "failed", error: "abandoned", completedAt: new Date() }).where(eq(aiGenerations.id, v.generationId));
      await refundGeneration(db, workspaceId, v.generationId, v.credits);
    }
  }
}

export const generateSchema = z.object({
  kind: z.enum(["ai_image", "layout"]),
  textMode: z.enum(["overlay", "in_image"]).default("overlay"),
  style: z.enum(POSTER_STYLES as [PosterStyle, ...PosterStyle[]]).optional(),
  requestKey: z.string().min(8).max(64),
});

/**
 * Creates a new poster version. AI images reserve `poster.image` credits up front, refund on
 * failure, and are idempotent per requestKey (a retried click never charges twice). Earlier
 * versions are always kept. Layout versions use the seller's product photo and cost nothing.
 */
export async function generateVersion(ctx: Ctx, posterId: string, raw: unknown) {
  const input = generateSchema.parse(raw);
  const p = await ownedPoster(ctx.db, ctx.workspaceId, posterId);
  const pr = await getProject(ctx.db, ctx.workspaceId, p.projectId);
  if (pr.status !== "approved") throw new AppError("posters.notApproved");
  const dupe = await ctx.db.query.posterVersions.findFirst({ where: and(eq(posterVersions.workspaceId, ctx.workspaceId), eq(posterVersions.requestKey, input.requestKey)) });
  if (dupe) return dupe;
  await reapStaleVersions(ctx.db, ctx.workspaceId);

  // Style change → recompile prompts for this poster (unless the seller hand-wrote the prompt).
  let poster = p;
  if (input.style && input.style !== p.style) {
    const concept = pr.brief.concepts[p.idx] ?? pr.brief.concepts[0]!;
    const compiled = promptsFor(pr, { ...concept, copy: p.copy }, input.style);
    const [updated] = await ctx.db.update(posters).set({ style: input.style, ...(p.promptEdited ? {} : compiled), updatedAt: new Date() }).where(eq(posters.id, p.id)).returning();
    poster = updated!;
  }

  if (input.kind === "layout") {
    const product = poster.productId ? await ctx.db.query.products.findFirst({ where: eq(products.id, poster.productId) }) : null;
    const id = newId("pvr");
    const [v] = await ctx.db
      .insert(posterVersions)
      .values({ id, workspaceId: ctx.workspaceId, posterId: poster.id, version: await nextVersion(ctx.db, poster.id), kind: "layout", textMode: "overlay", status: "succeeded", artAssetId: product?.imageAssetId ?? null, copy: poster.copy, style: poster.style, ratio: poster.ratio, requestKey: input.requestKey, createdBy: ctx.userId, completedAt: new Date() })
      .returning();
    await ctx.db.update(posters).set({ currentVersionId: id, updatedAt: new Date() }).where(eq(posters.id, poster.id));
    return v!;
  }

  if (!imageGenerationConfigured()) throw new AppError("posters.imageProviderMissing");
  const busy = await ctx.db.query.posterVersions.findFirst({ where: and(eq(posterVersions.posterId, poster.id), eq(posterVersions.status, "generating")) });
  if (busy) throw new AppError("posters.busy");
  const cost = CREDIT_COSTS["poster.image"];
  const info = imageProviderInfo();
  const generationId = newId("gen");
  const versionId = newId("pvr");
  const prompt = input.textMode === "overlay" ? poster.artPrompt : poster.prompt;
  await ctx.db.transaction(async (tx) => {
    await lockWorkspace(tx, ctx.workspaceId);
    const balance = await creditBalance(tx, ctx.workspaceId);
    if (balance < cost) throw new AppError("credits.insufficient", { balance, cost });
    await tx.insert(aiGenerations).values({ id: generationId, workspaceId: ctx.workspaceId, userId: ctx.userId, task: "poster.image", provider: info.name, model: info.model, input: { posterId: poster.id, textMode: input.textMode }, credits: cost });
    await tx.insert(aiCreditLedger).values({ id: newId("crd"), workspaceId: ctx.workspaceId, delta: -cost, reason: "generation", generationId });
    await tx.insert(posterVersions).values({ id: versionId, workspaceId: ctx.workspaceId, posterId: poster.id, version: await nextVersion(tx as unknown as DB, poster.id), kind: "ai_image", textMode: input.textMode, status: "generating", copy: poster.copy, style: poster.style, ratio: poster.ratio, prompt, provider: info.name, model: info.model, credits: cost, generationId, requestKey: input.requestKey, createdBy: ctx.userId });
  });

  try {
    const img = await generateImage({ prompt, ratio: poster.ratio });
    const asset = await storeImageBytes(ctx.db, { workspaceId: ctx.workspaceId, buf: img.bytes, originalName: `poster-art-${versionId}`, limit: 20 * 1024 * 1024 });
    await ctx.db.update(aiGenerations).set({ status: "succeeded", output: { assetId: asset.id }, model: img.model, completedAt: new Date() }).where(eq(aiGenerations.id, generationId));
    const [v] = await ctx.db.update(posterVersions).set({ status: "succeeded", artAssetId: asset.id, model: img.model, completedAt: new Date() }).where(eq(posterVersions.id, versionId)).returning();
    await ctx.db.update(posters).set({ currentVersionId: versionId, updatedAt: new Date() }).where(eq(posters.id, poster.id));
    log("info", "poster.image.succeeded", { workspaceId: ctx.workspaceId, posterId: poster.id, versionId });
    return v!;
  } catch (e) {
    const code = e instanceof AIProviderError ? e.code : e instanceof AppError ? e.code : "ai.providerError";
    await ctx.db.update(posterVersions).set({ status: "failed", error: code, completedAt: new Date() }).where(eq(posterVersions.id, versionId));
    await ctx.db.update(aiGenerations).set({ status: "failed", error: e instanceof Error ? e.message.slice(0, 1000) : String(e), completedAt: new Date() }).where(eq(aiGenerations.id, generationId));
    await refundGeneration(ctx.db, ctx.workspaceId, generationId, cost);
    log("warn", "poster.image.failed", { workspaceId: ctx.workspaceId, posterId: poster.id, code });
    throw new AppError(code);
  }
}

/**
 * Text edits. With the exact-text overlay, new text re-renders on the same artwork (a free new
 * version). Artwork whose text was drawn by the image model can't be edited — it must be regenerated.
 */
export async function editCopy(ctx: Ctx, posterId: string, raw: unknown) {
  const copy = copySchema.parse(raw) as PosterCopy;
  const p = await ownedPoster(ctx.db, ctx.workspaceId, posterId);
  const pr = await getProject(ctx.db, ctx.workspaceId, p.projectId);
  const concept = pr.brief.concepts[p.idx] ?? pr.brief.concepts[0]!;
  const compiled = promptsFor(pr, { ...concept, copy, visual: { ...concept.visual, style: p.style } });
  await ctx.db.update(posters).set({ copy, ...(p.promptEdited ? {} : compiled), status: p.status === "published" ? "published" : "draft", updatedAt: new Date() }).where(eq(posters.id, p.id));
  const cur = p.currentVersionId ? await ctx.db.query.posterVersions.findFirst({ where: eq(posterVersions.id, p.currentVersionId) }) : null;
  if (!cur || cur.status !== "succeeded") return { needsRegeneration: false, versionId: null };
  if (cur.textMode === "in_image") return { needsRegeneration: true, versionId: null };
  const id = newId("pvr");
  await ctx.db.insert(posterVersions).values({ id, workspaceId: ctx.workspaceId, posterId: p.id, version: await nextVersion(ctx.db, p.id), kind: cur.kind, textMode: "overlay", status: "succeeded", artAssetId: cur.artAssetId, copy, style: cur.style, ratio: cur.ratio, prompt: cur.prompt, provider: cur.provider, model: cur.model, credits: 0, requestKey: newId("edit"), createdBy: ctx.userId, completedAt: new Date() });
  await ctx.db.update(posters).set({ currentVersionId: id }).where(eq(posters.id, p.id));
  return { needsRegeneration: false, versionId: id };
}

export async function setCurrentVersion(ctx: Ctx, posterId: string, versionId: string) {
  const p = await ownedPoster(ctx.db, ctx.workspaceId, posterId);
  const v = await ctx.db.query.posterVersions.findFirst({ where: and(eq(posterVersions.id, versionId), eq(posterVersions.posterId, p.id), eq(posterVersions.status, "succeeded")) });
  if (!v) throw new AppError("errors.notFound");
  await ctx.db.update(posters).set({ currentVersionId: v.id, copy: v.copy, updatedAt: new Date() }).where(eq(posters.id, p.id));
}

/** "Save to Creative Library": stores the final composed PNG/JPG the seller approved. */
export async function saveRender(ctx: Ctx, versionId: string, buf: Buffer) {
  const v = await ctx.db.query.posterVersions.findFirst({ where: and(eq(posterVersions.id, versionId), eq(posterVersions.workspaceId, ctx.workspaceId)) });
  if (!v || v.status !== "succeeded") throw new AppError("errors.notFound");
  const asset = await storeImageBytes(ctx.db, { workspaceId: ctx.workspaceId, buf, originalName: `poster-${v.posterId}-v${v.version}`, limit: 8 * 1024 * 1024 });
  await ctx.db.update(posterVersions).set({ imageAssetId: asset.id }).where(eq(posterVersions.id, v.id));
  const p = await ownedPoster(ctx.db, ctx.workspaceId, v.posterId);
  await ctx.db.update(posters).set({ currentVersionId: v.id, status: p.status === "published" ? "published" : "approved", updatedAt: new Date() }).where(eq(posters.id, p.id));
  return asset.id;
}

const META_CTA: Record<PosterObjective, string> = { sales: "shop_now", leads: "sign_up", traffic: "learn_more", awareness: "learn_more", engagement: "learn_more" };
const ANGLE_TO_APPROACH: Record<string, string> = { problem_solution: "problem_solution", curiosity: "curiosity", mirror: "mirror", benefits: "benefits", educational: "educational", offer: "offer", direct: "direct" };

/**
 * "Use in Meta Ads": creates an AI Ads Studio draft with this poster as the creative. Generating
 * posters never consumes ad slots; only publishing that ad (in the ads flow) does.
 */
export async function useInAds(ctx: Ctx, posterId: string, base: string) {
  const p = await ownedPoster(ctx.db, ctx.workspaceId, posterId);
  if (!p.productId) throw new AppError("errors.notFound");
  const v = p.currentVersionId ? await ctx.db.query.posterVersions.findFirst({ where: eq(posterVersions.id, p.currentVersionId) }) : null;
  if (!v?.imageAssetId) throw new AppError("posters.saveFirst");
  const pr = await getProject(ctx.db, ctx.workspaceId, p.projectId);
  const adId = await createDraft(ctx, p.productId, base);
  const quote = p.theme === "testimonial" ? pr.brief.evidence.testimonials[pr.brief.concepts[p.idx]?.testimonialIndex ?? -1] : null;
  const primaryText = [v.copy.headline, ...(quote ? [`"${quote.quote}" — ${quote.author}`] : []), ...v.copy.body.map((b) => `✅ ${b}`), "", v.copy.cta].join("\n").slice(0, 2200);
  await updateDraft(ctx, adId, {
    step: "strategy",
    creative: { approach: p.theme === "testimonial" ? "testimonial" : (ANGLE_TO_APPROACH[p.angle] ?? "direct"), primaryText, headline: v.copy.headline.slice(0, 255), description: money(pr.brief.product.priceSen), cta: META_CTA[pr.brief.strategy.objective], imageAssetId: v.imageAssetId, ratio: v.ratio },
  });
  await ctx.db.update(posters).set({ adId, updatedAt: new Date() }).where(eq(posters.id, p.id));
  return adId;
}

/** Copies a poster (text, prompts, current artwork) into a new draft variation in the same project. */
export async function duplicatePoster(ctx: Ctx, posterId: string) {
  const p = await ownedPoster(ctx.db, ctx.workspaceId, posterId);
  const [row] = await ctx.db.select({ m: sql<number>`coalesce(max(${posters.idx}),0)::int` }).from(posters).where(eq(posters.projectId, p.projectId));
  const id = newId("pst");
  await ctx.db.insert(posters).values({ id, workspaceId: ctx.workspaceId, projectId: p.projectId, productId: p.productId, idx: Number(row?.m ?? 0) + 1, theme: p.theme, angle: p.angle, style: p.style, ratio: p.ratio, copy: p.copy, prompt: p.prompt, artPrompt: p.artPrompt, promptEdited: p.promptEdited });
  const cur = p.currentVersionId ? await ctx.db.query.posterVersions.findFirst({ where: eq(posterVersions.id, p.currentVersionId) }) : null;
  if (cur?.status === "succeeded") {
    const vid = newId("pvr");
    await ctx.db.insert(posterVersions).values({ ...cur, id: vid, posterId: id, version: 1, imageAssetId: null, credits: 0, generationId: null, requestKey: newId("dup"), createdBy: ctx.userId, createdAt: new Date() });
    await ctx.db.update(posters).set({ currentVersionId: vid }).where(eq(posters.id, id));
  }
  return id;
}

/** Duplicated posters with a concept index beyond the brief reuse the closest concept for prompts. */
export async function projectView(db: DB, workspaceId: string, id: string) {
  const pr = await getProject(db, workspaceId, id);
  await reapStaleVersions(db, workspaceId);
  const list = await db.query.posters.findMany({ where: eq(posters.projectId, pr.id), orderBy: asc(posters.idx) });
  const versions = list.length ? await db.query.posterVersions.findMany({ where: inArray(posterVersions.posterId, list.map((p) => p.id)), orderBy: desc(posterVersions.version) }) : [];
  const adIds = list.map((p) => p.adId).filter((x): x is string => Boolean(x));
  const adRows = adIds.length ? await db.select({ id: ads.id, status: ads.status }).from(ads).where(inArray(ads.id, adIds)) : [];
  return { project: pr, posters: list, versions, ads: Object.fromEntries(adRows.map((a) => [a.id, a.status])) };
}

// ------------------------------------------------------------------ Creative Library

export type LibraryFilters = { productId?: string; theme?: string; status?: string };

export async function libraryView(db: DB, workspaceId: string, f: LibraryFilters = {}) {
  await reapStaleVersions(db, workspaceId);
  const conds = [eq(posters.workspaceId, workspaceId)];
  if (f.productId) conds.push(eq(posters.productId, f.productId));
  if (f.theme && (POSTER_THEMES as string[]).includes(f.theme)) conds.push(eq(posters.theme, f.theme as PosterTheme));
  const list = await db.query.posters.findMany({ where: and(...conds), orderBy: desc(posters.updatedAt), limit: 120 });
  if (!list.length) return [];
  const ids = list.map((p) => p.id);
  const versions = await db.query.posterVersions.findMany({ where: inArray(posterVersions.posterId, ids), orderBy: desc(posterVersions.version) });
  const adIds = list.map((p) => p.adId).filter((x): x is string => Boolean(x));
  const adRows = adIds.length ? await db.select({ id: ads.id, status: ads.status, publishedAt: ads.publishedAt }).from(ads).where(inArray(ads.id, adIds)) : [];
  const perf = adIds.length
    ? await db
        .select({ adId: adInsightsDaily.adId, date: adInsightsDaily.date, spend: adInsightsDaily.spendSen, purchases: adInsightsDaily.purchases, revenue: adInsightsDaily.revenueSen })
        .from(adInsightsDaily)
        .where(and(eq(adInsightsDaily.workspaceId, workspaceId), inArray(adInsightsDaily.adId, adIds)))
        .orderBy(asc(adInsightsDaily.date))
    : [];
  const prods = await db.select({ id: products.id, name: products.name, imageAssetId: products.imageAssetId }).from(products).where(inArray(products.id, list.map((p) => p.productId).filter((x): x is string => Boolean(x)).concat("__none__")));
  const rows = list.map((p) => {
    const vs = versions.filter((v) => v.posterId === p.id);
    const current = vs.find((v) => v.id === p.currentVersionId) ?? null;
    const ad = adRows.find((a) => a.id === p.adId) ?? null;
    const days = perf.filter((r) => r.adId === p.adId);
    const spend = days.reduce((a, r) => a + r.spend, 0);
    const purchases = days.reduce((a, r) => a + r.purchases, 0);
    const revenue = days.reduce((a, r) => a + r.revenue, 0);
    const status = ad?.publishedAt ? "published" : p.status;
    return {
      poster: p,
      status,
      current,
      versionCount: vs.filter((v) => v.status === "succeeded").length,
      product: prods.find((x) => x.id === p.productId) ?? null,
      ad,
      performance: days.length ? { spendSen: spend, purchases, cppSen: purchases ? Math.round(spend / purchases) : null, roas: spend ? revenue / spend : null, trend: days.slice(-14).map((r) => r.spend) } : null,
    };
  });
  return f.status ? rows.filter((r) => r.status === f.status) : rows;
}
