import { z } from "zod";
import type { SectionType, StorefrontContent, StorefrontSection, StorefrontTheme } from "@/lib/db/schema";
import { newId } from "@/lib/ids";

const str = (max = 300) => z.string().max(max).default("");
const items = <T extends z.ZodType>(t: T, max: number) => z.array(t).max(max).default([]);

export const SECTION_PROPS: Record<SectionType, z.ZodType> = {
  hero: z.object({ headline: str(120), subheadline: str(400), cta: str(40), imageAssetId: z.string().nullable().optional() }),
  showcase: z.object({ title: str(120) }),
  benefits: z.object({ title: str(120), items: items(z.object({ title: str(80), body: str(300) }), 6) }),
  problem_solution: z.object({ problem: str(600), solution: str(600) }),
  social_proof: z.object({
    title: str(120),
    testimonials: items(z.object({ quote: str(500), author: str(80) }), 6),
    /** Seller attests these testimonials are real. Unconfirmed testimonials are never rendered. */
    confirmed: z.boolean().default(false),
  }),
  offer: z.object({ title: str(120), body: str(600) }),
  pricing: z.object({ title: str(120) }),
  faq: z.object({ title: str(120), items: items(z.object({ q: str(200), a: str(800) }), 12) }),
  cta: z.object({ headline: str(120), button: str(40) }),
  catalog: z.object({ title: str(120), showSearch: z.boolean().default(true) }),
  /** Key facts (duration, date, venue, format…) — only values the seller provided. */
  details: z.object({ title: str(120), items: items(z.object({ label: str(60), value: str(300) }), 10) }),
  contact: z.object({ title: str(120), body: str(400), mode: z.enum(["enquiry", "interest"]).default("enquiry") }),
  /** Seller embed: allowlisted provider URL, or an HTML snippet isolated in a sandboxed iframe (lib/storefront/embed.ts). */
  embed: z.object({ title: str(120), mode: z.enum(["url", "html"]).default("url"), url: str(500), html: str(20_000), height: z.number().int().min(120).max(1600).default(480) }),
};

export const SECTION_TYPES = Object.keys(SECTION_PROPS) as SectionType[];

const hex = z.string().regex(/^#[0-9a-fA-F]{6}$/);
export const themeSchema = z.object({ primary: hex, accent: hex, background: hex, text: hex, preset: z.string().max(30).optional(), onPrimary: hex.optional() });

export const contentSchema = z.object({
  sections: z
    .array(
      z.object({ id: z.string().min(1).max(40), type: z.enum(SECTION_TYPES as [SectionType, ...SectionType[]]), visible: z.boolean(), props: z.record(z.string(), z.unknown()) }),
    )
    .max(20),
  productIds: z.array(z.string()).max(20),
  seoTitle: z.string().max(120).optional(),
  policies: z
    .object({
      contactEmail: z.union([z.string().email().max(200), z.literal("")]).optional(),
      contactPhone: z.string().max(30).optional(),
      refund: z.string().max(2000).optional(),
      shipping: z.string().max(2000).optional(),
    })
    .optional(),
  orderBumpProductId: z.string().nullable().optional(),
  websiteType: z.string().max(40).optional(),
  salesMode: z.enum(["checkout", "enquiry"]).optional(),
});

/** Validates and normalizes section props (unknown keys dropped, defaults applied). */
export function normalizeContent(raw: unknown): StorefrontContent {
  const c = contentSchema.parse(raw);
  return {
    ...c,
    sections: c.sections.map((s) => ({ ...s, props: SECTION_PROPS[s.type].parse(s.props) as Record<string, unknown> })),
  };
}

export function section(type: SectionType, props: Record<string, unknown>, visible = true): StorefrontSection {
  return { id: newId("sec").slice(0, 20), type, visible, props: SECTION_PROPS[type].parse(props) as Record<string, unknown> };
}

export const DEFAULT_THEME: StorefrontTheme = { primary: "#1F83D8", accent: "#BFE5FF", background: "#FFFFFF", text: "#171717", preset: "modern", onPrimary: "#FFFFFF" };
