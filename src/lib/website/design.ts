import type { StorefrontTheme } from "@/lib/db/schema";
import type { Category } from "@/lib/categories";

/**
 * Niche-aware design engine. Each preset defines the storefront's own visual identity
 * (independent of the SellNow admin look); the seller's brand colours override the palette.
 */
export type DesignPresetId = "beauty" | "food" | "fashion" | "professional" | "fitness" | "education" | "events" | "modern";

export type DesignPreset = {
  id: DesignPresetId;
  /** Heading font family (CSS var loaded in components/storefront/fonts.ts). */
  heading: "serif" | "sans" | "display";
  hero: "split" | "centered" | "editorial";
  radius: "soft" | "round" | "sharp";
  palette: { primary: string; accent: string; background: string; text: string };
};

export const DESIGN_PRESETS: Record<DesignPresetId, DesignPreset> = {
  beauty: { id: "beauty", heading: "serif", hero: "editorial", radius: "soft", palette: { primary: "#B4846C", accent: "#E8D5C4", background: "#FBF7F2", text: "#2B2421" } },
  food: { id: "food", heading: "display", hero: "split", radius: "round", palette: { primary: "#D9480F", accent: "#FFC078", background: "#FFF9F2", text: "#2B1A10" } },
  fashion: { id: "fashion", heading: "serif", hero: "editorial", radius: "sharp", palette: { primary: "#111111", accent: "#C9B79C", background: "#FFFFFF", text: "#111111" } },
  professional: { id: "professional", heading: "sans", hero: "split", radius: "soft", palette: { primary: "#1D4ED8", accent: "#93C5FD", background: "#F8FAFC", text: "#0F172A" } },
  fitness: { id: "fitness", heading: "display", hero: "centered", radius: "sharp", palette: { primary: "#E11D48", accent: "#111827", background: "#0B0B0F", text: "#F5F5F5" } },
  education: { id: "education", heading: "sans", hero: "split", radius: "round", palette: { primary: "#4F46E5", accent: "#FDE68A", background: "#FAFAFF", text: "#1E1B4B" } },
  events: { id: "events", heading: "display", hero: "centered", radius: "round", palette: { primary: "#7C3AED", accent: "#F472B6", background: "#FCFAFF", text: "#1A1033" } },
  modern: { id: "modern", heading: "sans", hero: "split", radius: "round", palette: { primary: "#1F83D8", accent: "#BFE5FF", background: "#FFFFFF", text: "#171717" } },
};

const KEYWORDS: [DesignPresetId, RegExp][] = [
  ["beauty", /skin|serum|beauty|cosmetic|kosmetik|makeup|solek|kecantikan|spa|facial|lipstick|perfume|minyak wangi|skincare|salon/i],
  ["food", /food|makan|sambal|kek|cake|kuih|bakery|roti|cookies|biskut|kopi|coffee|drink|minuman|catering|masak|resepi|snack|kerepek|rendang|nasi|sos|sauce|frozen/i],
  ["fashion", /fashion|baju|tudung|hijab|shawl|dress|kurta|kurung|clothing|pakaian|shoe|kasut|bag|beg|jewel|barang kemas|apparel|t-?shirt/i],
  ["fitness", /fitness|gym|workout|senaman|yoga|pilates|coach|trainer|muscle|sport|sukan|running|larian/i],
  ["education", /course|kursus|kelas|class|tuition|tusyen|ebook|e-book|learn|belajar|tutor|academy|akademi|sekolah|quran|mengaji|template|guide|panduan/i],
  ["events", /event|majlis|workshop|bengkel|seminar|concert|konsert|festival|conference|webinar|ticket|tiket|wedding|perkahwinan/i],
  ["professional", /consult|perunding|lawyer|peguam|account|akaun|tax|cukai|agency|agensi|design|reka|marketing|pemasaran|legal|finance|kewangan|engineer|architect|clinic|klinik|insurance/i],
];

export function detectDesignPreset(category: Category | null, text: string): DesignPresetId {
  for (const [id, re] of KEYWORDS) if (re.test(text)) return id;
  if (category === "service" || category === "booking") return "professional";
  if (category === "event") return "events";
  if (category === "digital" || category === "membership") return "education";
  return "modern";
}

function luminance(hex: string) {
  const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * c[0]! + 0.7152 * c[1]! + 0.0722 * c[2]!;
}

export function contrastRatio(a: string, b: string) {
  const [x, y] = [luminance(a), luminance(b)].sort((m, n) => n - m) as [number, number];
  return (x + 0.05) / (y + 0.05);
}

/** Readable text colour on a filled button of the given colour. */
export function onColor(hex: string) {
  return contrastRatio(hex, "#FFFFFF") >= contrastRatio(hex, "#171717") ? "#FFFFFF" : "#171717";
}

const HEX = /^#[0-9a-fA-F]{6}$/;

/** Builds the storefront theme: niche preset palette, overridden by valid seller brand colours. */
export function buildTheme(preset: DesignPresetId, brand: { primary?: string; accent?: string }): StorefrontTheme {
  const p = DESIGN_PRESETS[preset];
  let primary = brand.primary && HEX.test(brand.primary) ? brand.primary : p.palette.primary;
  // Dark presets keep light text; make sure the brand primary stays visible on the background.
  if (contrastRatio(primary, p.palette.background) < 2) primary = p.palette.primary;
  const accent = brand.accent && HEX.test(brand.accent) ? brand.accent : p.palette.accent;
  return { primary, accent, background: p.palette.background, text: p.palette.text, preset, onPrimary: onColor(primary) };
}
