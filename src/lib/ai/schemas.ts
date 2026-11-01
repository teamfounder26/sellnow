import { z } from "zod";
import { CATEGORIES, FACT_KEYS } from "@/lib/categories";

export const analyzeSchema = z.object({
  category: z.enum(CATEGORIES as [string, ...string[]]).nullable(),
  confidence: z.number().int().describe("0-100 confidence in the category"),
  category_reason: z.string(),
  extracted: z
    .array(z.object({ field: z.enum(FACT_KEYS as [string, ...string[]]), value: z.string() }))
    .describe("Only facts the user explicitly stated or that are directly visible in the image. Prices as plain numbers like 19.90."),
  next_questions: z
    .array(z.object({ field: z.enum(FACT_KEYS as [string, ...string[]]), question: z.string() }))
    .describe("At most 2 short questions for the most important missing facts."),
  assistant_message: z.string().describe("Short, friendly reply in the requested language."),
});
export type AnalyzeOutput = z.infer<typeof analyzeSchema>;

export const profileSchema = z.object({
  business_name_suggestions: z.array(z.string()),
  short_description: z.string(),
  product_description: z.string(),
  target_audience: z.string(),
  usp: z.string(),
  offer: z.string(),
  brand_tone: z.string(),
  brand_primary_hex: z.string().describe("#RRGGBB"),
  brand_accent_hex: z.string().describe("#RRGGBB"),
  faq: z.array(z.object({ q: z.string(), a: z.string() })).describe("3-5 FAQs answerable ONLY from the provided facts."),
});
export type ProfileOutput = z.infer<typeof profileSchema>;

export const storefrontCopySchema = z.object({
  seo_title: z.string(),
  hero: z.object({ headline: z.string(), subheadline: z.string(), cta: z.string() }),
  benefits: z.array(z.object({ title: z.string(), body: z.string() })),
  problem: z.string(),
  solution: z.string(),
  offer_title: z.string(),
  offer_body: z.string(),
  closing_headline: z.string(),
  closing_cta: z.string(),
});
export type StorefrontCopyOutput = z.infer<typeof storefrontCopySchema>;

export const creativeTextSchema = z.object({
  variants: z.array(
    z.object({
      headline: z.string(),
      primary_text: z.string(),
      call_to_action: z.string(),
      hashtags: z.array(z.string()),
    }),
  ),
  notes: z.string().describe("Any facts you could not verify and therefore left out."),
});
export type CreativeTextOutput = z.infer<typeof creativeTextSchema>;

// ---------------------------------------------------------------- V2 onboarding

/** Profile fields the AI may fill. Anything verifiable (price, contact, location) must come from a source. */
export const PROFILE_KEYS = [
  "business_name",
  "tagline",
  "short_description",
  "description",
  "product_name",
  "target_audience",
  "value_proposition",
  "usp",
  "brand_tone",
  "brand_primary",
  "brand_accent",
  "price",
  "contact_email",
  "contact_phone",
  "location",
  "fulfillment",
  "shipping_fee",
  "file_format",
  "service_scope",
  "duration",
  "event_date",
  "capacity",
  "billing_period",
] as const;
export type ProfileKey = (typeof PROFILE_KEYS)[number];

const source = z.enum(["user", "extracted", "ai_suggested"]).describe('"user" = the seller stated it; "extracted" = read from a provided document/link/image; "ai_suggested" = your suggestion');

export const identifySchema = z.object({
  category: z.enum(CATEGORIES as [string, ...string[]]).nullable(),
  confidence: z.number().int().describe("0-100 confidence in the category"),
  category_reason: z.string(),
  clarification_question: z.string().nullable().describe("ONE short question, only if confidence < 70; else null"),
  products: z
    .array(z.object({ name: z.string(), description: z.string(), price: z.string().nullable().describe("Only if stated in a source, e.g. 19.90"), source }))
    .describe("Products/services actually mentioned. Max 10."),
  facts: z.array(z.object({ field: z.enum(PROFILE_KEYS), value: z.string(), source })).describe("Facts stated by the seller or present in the sources. No guesses."),
  missing: z.array(z.enum(PROFILE_KEYS)).describe("Important facts nobody provided"),
});
export type IdentifyOutput = z.infer<typeof identifySchema>;

export const profileGenSchema = z.object({
  fields: z.array(z.object({ field: z.enum(PROFILE_KEYS), value: z.string(), source })).describe("Fill every field you can. Never invent price, contact details or location."),
  faq: z.array(z.object({ q: z.string(), a: z.string() })).describe("3-5 FAQs answerable ONLY from the provided facts."),
  recommended_website: z.object({ type: z.string(), reason: z.string().describe("One sentence for the seller") }),
});
export type ProfileGenOutput = z.infer<typeof profileGenSchema>;
