import { and, eq } from "drizzle-orm";
import { z } from "zod";
import type { DB } from "@/lib/db";
import { businessProfiles, creatives, products, storefronts, type AdAudience, type AdCreative, type AdObjective, type AdStrategy } from "@/lib/db/schema";
import { ENGINES, type Category } from "@/lib/categories";
import { runGeneration } from "@/lib/ai/run";
import { isAIConfigured } from "@/lib/ai/provider";
import { languageName } from "@/lib/ai/prompts";
import { getPaymentIntegration } from "@/lib/payments/integrations";
import { newId } from "@/lib/ids";
import { AppError } from "@/lib/errors";

type Ctx = { db: DB; workspaceId: string; userId: string; locale: "ms" | "en" };
type Product = typeof products.$inferSelect;

export const OBJECTIVES: AdObjective[] = ["sales", "leads", "messages", "traffic"];
export const APPROACHES = ["problem_solution", "curiosity", "mirror", "benefits", "educational", "testimonial", "offer", "direct"] as const;
export type Approach = (typeof APPROACHES)[number];
export const CTAS = ["shop_now", "order_now", "learn_more", "sign_up", "send_message", "contact_us", "get_quote", "subscribe", "download"] as const;

/** Which objectives genuinely work for this product today (e.g. Sales needs a live checkout). */
export async function availableObjectives(db: DB, workspaceId: string, p: Product) {
  const sf = await db.query.storefronts.findFirst({ where: eq(storefronts.workspaceId, workspaceId) });
  const payment = await getPaymentIntegration(db, workspaceId);
  const live = Boolean(sf?.publishedVersionId);
  const checkoutMode = sf?.draftContent.salesMode !== "enquiry";
  const sales = live && checkoutMode && Boolean(payment) && ENGINES[p.type as Category].checkout === "full";
  return { sales, leads: live, messages: true, traffic: live, live };
}

/** Confirmed facts only — the AI may not add benefits that aren't here. */
export async function factSheet(db: DB, workspaceId: string, p: Product) {
  const profile = await db.query.businessProfiles.findFirst({ where: eq(businessProfiles.workspaceId, workspaceId) });
  const facts = Object.entries(profile?.fields ?? {})
    .filter(([, f]) => (f.status === "confirmed" || f.status === "user") && f.value != null && f.value !== "")
    .map(([k, f]) => `${k}: ${k === "price" ? `RM${(Number(f.value) / 100).toFixed(2)}` : String(f.value)}`);
  return [`product_name: ${p.name}`, `price: RM${(p.priceSen / 100).toFixed(2)}`, `category: ${p.type}`, p.description ? `product_description: ${p.description}` : "", ...facts].filter(Boolean).join("\n");
}

export function ruleStrategy(p: Product, avail: Awaited<ReturnType<typeof availableObjectives>>): AdStrategy {
  const objective: AdObjective = avail.sales ? "sales" : avail.leads && ["service", "booking", "event", "membership"].includes(p.type) ? "leads" : avail.leads ? "leads" : "messages";
  return { objective, reason: `rule.${objective}`, byAI: false };
}

export function ruleAudience(): AdAudience {
  // Broad, all genders, 18–65 in Malaysia: lets Meta's delivery find buyers instead of guessing demographics.
  return { country: "MY", ageMin: 18, ageMax: 65, gender: "all", mode: "broad", interests: [], placements: "advantage", reason: "rule.broad" };
}

const strategySchema = z.object({
  objective: z.enum(["sales", "leads", "messages", "traffic"]),
  objective_reason: z.string().describe("One or two simple sentences for a first-time advertiser"),
  customer_problem: z.string(),
  target_buyer: z.string(),
  benefits: z.array(z.string()).describe("Only benefits stated in the facts"),
  purchase_intent: z.string(),
  audience: z.object({
    age_min: z.number().int(),
    age_max: z.number().int(),
    gender: z.enum(["all", "female", "male"]).describe('"all" unless the product is clearly for one gender'),
    mode: z.enum(["broad", "detailed"]),
    interests: z.array(z.string()).describe("Only for detailed mode; max 5"),
    reason: z.string(),
  }),
});

/** AI campaign strategy + audience (validated & constrained), or the rule-based fallback. */
export async function recommendStrategy(ctx: Ctx, p: Product): Promise<{ strategy: AdStrategy; audience: AdAudience }> {
  const avail = await availableObjectives(ctx.db, ctx.workspaceId, p);
  if (!(await isAIConfigured())) return { strategy: ruleStrategy(p, avail), audience: ruleAudience() };
  const allowed = OBJECTIVES.filter((o) => avail[o]);
  const { data } = await runGeneration(ctx.db, {
    workspaceId: ctx.workspaceId,
    userId: ctx.userId,
    task: "ads.strategy",
    input: { productId: p.id },
    request: {
      system: `You are an experienced Meta Ads performance marketer for Malaysian SMEs. Recommend a campaign objective from: ${allowed.join(", ")} (only these are possible right now — "sales" requires a working website checkout).
Prefer "sales" when allowed. Recommend a Malaysian audience: do not assume age 24+; choose ages that fit the buyer; keep gender "all" unless clearly justified; prefer broad targeting unless the product is very niche.
Use ONLY the facts given; never invent benefits, results, reviews or certifications. Write all text in ${languageName(ctx.locale)}, simple and practical.`,
      schema: strategySchema,
      prompt: `Confirmed facts:\n${await factSheet(ctx.db, ctx.workspaceId, p)}\n\nRecommend the strategy and audience.`,
    },
  });
  const objective = allowed.includes(data.objective) ? data.objective : ruleStrategy(p, avail).objective;
  const ageMin = Math.max(18, Math.min(65, data.audience.age_min));
  const ageMax = Math.max(ageMin, Math.min(65, data.audience.age_max));
  return {
    strategy: { objective, reason: data.objective_reason, customerProblem: data.customer_problem, targetBuyer: data.target_buyer, benefits: data.benefits.slice(0, 5), purchaseIntent: data.purchase_intent, byAI: true },
    audience: { country: "MY", ageMin, ageMax, gender: data.audience.gender, mode: data.audience.mode, interests: data.audience.mode === "detailed" ? data.audience.interests.slice(0, 5) : [], placements: "advantage", reason: data.audience.reason },
  };
}

const creativeSchema = z.object({
  variants: z
    .array(
      z.object({
        hook: z.string().describe("Strong first line"),
        primary_text: z.string().describe("Full primary text: hook, customer problem, solution, benefits, call to action"),
        headline: z.string().describe("Max ~40 characters, benefit-driven"),
        description: z.string().describe("Short supporting purchase reason"),
        cta: z.enum(CTAS),
      }),
    )
    .describe("Exactly 2 variants"),
  notes: z.string().describe("Facts you could not verify and therefore left out"),
});

const APPROACH_GUIDE: Record<Approach, string> = {
  problem_solution: "Open with the customer's problem, then present the product as the solution.",
  curiosity: "Open with an honest curiosity hook that makes people want to read on (no clickbait claims).",
  mirror: "Mirror statement: describe the reader's situation in their own words so they feel understood.",
  benefits: "Lead with the clearest product benefits from the facts.",
  educational: "Teach one useful thing related to the product, then introduce it.",
  testimonial: "Use ONLY the verified testimonials provided, quoted exactly; never invent quotes.",
  offer: "Lead with the offer/promotion — only if an offer exists in the facts.",
  direct: "Direct response: clear what, price, why now, and the action to take.",
};

/** Verified testimonials only (seller-confirmed on the storefront). */
export async function confirmedTestimonials(db: DB, workspaceId: string) {
  const sf = await db.query.storefronts.findFirst({ where: eq(storefronts.workspaceId, workspaceId) });
  const s = sf?.draftContent.sections.find((x) => x.type === "social_proof");
  return s && s.props.confirmed ? ((s.props.testimonials as { quote: string; author: string }[]) ?? []) : [];
}

export async function testimonialAvailable(db: DB, workspaceId: string) {
  return (await confirmedTestimonials(db, workspaceId)).length > 0;
}

/**
 * Generates a Meta ad copy package for one approach and saves it as a creative (so it stays in the
 * creative library and can earn Creative Star when approved). Returns the variants.
 */
export async function generateAdCopy(ctx: Ctx, p: Product, approach: Approach, objective: AdObjective) {
  const quotes = await confirmedTestimonials(ctx.db, ctx.workspaceId);
  if (approach === "testimonial" && quotes.length === 0) throw new AppError("ads.noTestimonials");
  const { data, generationId } = await runGeneration(ctx.db, {
    workspaceId: ctx.workspaceId,
    userId: ctx.userId,
    task: "ads.creative",
    input: { productId: p.id, approach },
    request: {
      system: `You write Meta (Facebook/Instagram) ads for Malaysian SMEs. Approach: ${APPROACH_GUIDE[approach]}
Campaign objective: ${objective}. Pick the most suitable CTA for it (sales → shop_now/order_now; leads → sign_up/get_quote/learn_more; messages → send_message).
Use ONLY the confirmed facts; mention the price only as stated; no medical, income or guaranteed-result claims; no fake reviews, urgency or discounts that aren't in the facts.
Write in ${languageName(ctx.locale)} as a Malaysian seller would. Exactly 2 variants.`,
      schema: creativeSchema,
      prompt: `Confirmed facts:\n${await factSheet(ctx.db, ctx.workspaceId, p)}${quotes.length ? `\n\nVerified testimonials:\n${quotes.map((q) => `"${q.quote}" — ${q.author}`).join("\n")}` : ""}\n\nWrite the ad.`,
    },
  });
  const id = newId("crt");
  await ctx.db.insert(creatives).values({ id, workspaceId: ctx.workspaceId, productId: p.id, type: "meta_ad", objective: approach, content: data as unknown as Record<string, unknown>, priceSnapshotSen: p.priceSen, generationId });
  return { creativeId: id, variants: data.variants.slice(0, 2).map((v): AdCreative => ({ approach, primaryText: v.primary_text, headline: v.headline, description: v.description, cta: v.cta })), notes: data.notes };
}

/** Starting point when AI is off — the seller's own facts, clearly not AI output; they edit before publishing. */
export function templateCopy(p: Product, objective: AdObjective, locale: "ms" | "en"): AdCreative {
  const price = `RM${(p.priceSen / 100).toFixed(2)}`;
  const cta = objective === "sales" ? "shop_now" : objective === "messages" ? "send_message" : "learn_more";
  return {
    approach: "direct",
    primaryText: locale === "ms" ? `${p.name} — ${price}.\n${p.description}\n\nKlik untuk ketahui lebih lanjut.` : `${p.name} — ${price}.\n${p.description}\n\nTap to learn more.`,
    headline: p.name.slice(0, 40),
    description: price,
    cta,
  };
}

export async function getOwnedProduct(db: DB, workspaceId: string, id: string) {
  const p = await db.query.products.findFirst({ where: and(eq(products.id, id), eq(products.workspaceId, workspaceId)) });
  if (!p) throw new AppError("errors.notFound");
  return p;
}
