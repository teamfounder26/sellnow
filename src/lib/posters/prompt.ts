import type { PosterBrief, PosterConcept, PosterRatio, PosterStyle, PosterTheme } from "@/lib/db/schema";
import { RATIO_PX } from "./options";

export const STYLE_DESC: Record<PosterStyle, string> = {
  fluent_3d: "3D Fluent-style illustration: soft rounded 3D shapes, glossy clay-like materials, gentle gradients, friendly and modern",
  flat: "clean flat vector illustration with simple geometric shapes and limited palette",
  chibi: "cute chibi character illustration with big heads, expressive faces and soft outlines",
  cartoon_3d: "premium 3D cartoon render, Pixar-like lighting, high-detail materials",
  photo: "photorealistic commercial product photography, studio lighting, shallow depth of field",
  editorial: "minimal editorial design, generous white space, refined typography-led composition, subtle accents",
};

/** Theme structure rules (shared by the AI brief instructions, the prompts and the composer). */
export const THEME_RULES: Record<PosterTheme, { purpose: string; structure: string; layouts: string }> = {
  educate: {
    purpose: "Educate the customer and build interest",
    structure: "educational headline; 3–4 useful tips or steps, each with its own matching illustration; product connection where appropriate; simple CTA",
    layouts: "numbered infographic, step-by-step cards, educational visual guide",
  },
  features: {
    purpose: "Explain what the product offers",
    structure: "benefit-driven headline; 3–4 verified features each with a feature-specific illustration; main product hero; CTA",
    layouts: "product hero with surrounding feature cards, floating 3D feature icons, premium product showcase",
  },
  usp: {
    purpose: "Highlight the single strongest differentiator",
    structure: "powerful headline; one primary USP; 2–3 supporting points; strong product hero; CTA",
    layouts: "large central product, bold typography, minimal supporting elements",
  },
  testimonial: {
    purpose: "Build credibility and trust with a real customer's words",
    structure: "customer-focused headline; the verified testimonial quoted exactly; supporting product context; CTA",
    layouts: "premium review card, quote-led composition, customer story visual",
  },
};

const NEGATIVE =
  "No distorted or warped packaging, no misspelled or extra text, no random unrelated objects, no watermarks, no fake logos, no fake badges, ratings or certifications, no cluttered background, no cut-off text, no extra limbs or malformed hands.";

function ratioLine(ratio: PosterRatio) {
  const px = RATIO_PX[ratio];
  return `${ratio} portrait-safe composition, final size ${px.w}×${px.h} px`;
}

/**
 * Compiles one approved concept into (a) a complete prompt carrying the exact approved text for
 * external tools, and (b) an artwork-only prompt for in-app generation, where SellNow overlays the
 * exact text itself so wording is never misspelled by the image model.
 */
export function compilePrompts(brief: PosterBrief, c: PosterConcept, opts: { ratio: PosterRatio; brandColors: string[]; showPrice: boolean; priceLabel: string; restrictions?: string; font?: string }) {
  const rules = THEME_RULES[c.theme];
  const colors = (opts.brandColors.length ? opts.brandColors : c.visual.colors).join(", ");
  const quote = c.theme === "testimonial" && c.testimonialIndex != null ? brief.evidence.testimonials[c.testimonialIndex] : null;
  const body = c.copy.body.map((b, i) => `  ${i + 1}. "${b}"`).join("\n");
  const illos = c.visual.supporting.length ? c.visual.supporting.map((s) => `  - ${s}`).join("\n") : "  - none beyond the hero";
  const shared = [
    `PRODUCT: ${brief.product.name}${opts.showPrice ? ` — ${opts.priceLabel}` : ""}. Main benefit: ${brief.product.mainBenefit}.`,
    `ADVERTISING OBJECTIVE: ${brief.strategy.objective}. TARGET AUDIENCE: ${brief.audience.customer} (problem: ${brief.audience.problem}; motivation: ${brief.audience.motivation}).`,
    `POSTER THEME: ${c.theme.toUpperCase()} — ${rules.purpose}. Structure: ${rules.structure}. Layout: ${c.visual.layout || rules.layouts}.`,
  ];
  const visual = [
    `ILLUSTRATION STYLE: ${STYLE_DESC[c.visual.style]}. Keep one consistent style across all elements.`,
    `HERO VISUAL: ${c.visual.hero}. Keep the product recognisable and true to its real packaging.`,
    `SUPPORTING ILLUSTRATIONS (each must support its matching message):\n${illos}`,
    `BRAND COLOURS: ${colors}. Clean white / soft neutral background with brand-colour accents.`,
    `LIGHTING: soft, even studio lighting with gentle shadows. QUALITY: high resolution, crisp edges, professional Meta Ads poster.`,
    `IMAGE RATIO: ${ratioLine(opts.ratio)}.`,
    opts.restrictions ? `RESTRICTIONS FROM THE BRAND: ${opts.restrictions}.` : "",
  ].filter(Boolean);

  const prompt = [
    `Design a high-attention advertising poster for Meta (Facebook/Instagram) Ads.`,
    ...shared,
    `EXACT TEXT — render exactly as written, nothing added:`,
    `  HEADLINE: "${c.copy.headline}"`,
    body ? `  BODY POINTS:\n${body}` : "",
    quote ? `  TESTIMONIAL: "${quote.quote}" — ${quote.author}` : "",
    `  CTA BUTTON: "${c.copy.cta}"`,
    `TYPOGRAPHY: bold modern sans-serif${opts.font ? ` (${opts.font})` : ""}; headline largest at the top, body points short and scannable, CTA in a high-contrast button; clear hierarchy, generous spacing, highly readable on mobile.`,
    ...visual,
    `AVOID: ${NEGATIVE} Do not overcrowd the poster.`,
  ]
    .filter(Boolean)
    .join("\n");

  const artPrompt = [
    `Create the artwork layer for an advertising poster. DO NOT render any words, letters, numbers or logos — text is added separately.`,
    ...shared,
    `Leave clean empty space: the top ~28% for a headline and the bottom ~18% for a button. ${c.theme === "educate" || c.theme === "features" ? `Arrange ${Math.max(2, c.copy.body.length)} small illustration spots for the points listed: ${c.copy.body.join("; ")}.` : ""}`,
    ...visual,
    `AVOID: any text or lettering. ${NEGATIVE}`,
  ]
    .filter(Boolean)
    .join("\n");

  return { prompt, artPrompt };
}
