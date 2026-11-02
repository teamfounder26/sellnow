import type { PosterAngle, PosterObjective, PosterRatio, PosterSettings, PosterStyle, PosterTheme } from "@/lib/db/schema";

/** Client-safe option lists for AI Poster Studio. */
export const POSTER_OBJECTIVES: PosterObjective[] = ["awareness", "traffic", "leads", "sales", "engagement"];
export const POSTER_THEMES: PosterTheme[] = ["educate", "features", "usp", "testimonial"];
export const POSTER_ANGLES: PosterAngle[] = ["problem_solution", "curiosity", "mirror", "benefits", "educational", "offer", "direct"];
export const POSTER_STYLES: PosterStyle[] = ["fluent_3d", "flat", "chibi", "cartoon_3d", "photo", "editorial"];
export const POSTER_RATIOS: PosterRatio[] = ["3:4", "4:5", "1:1", "9:16"];
export const POSTER_VARIATIONS = [1, 3, 5] as const;

/** Output canvas per ratio (3:4 default = 1200×1600). */
export const RATIO_PX: Record<PosterRatio, { w: number; h: number }> = {
  "3:4": { w: 1200, h: 1600 },
  "4:5": { w: 1200, h: 1500 },
  "1:1": { w: 1200, h: 1200 },
  "9:16": { w: 1080, h: 1920 },
};

export const DEFAULT_SETTINGS: PosterSettings = {
  objective: "auto",
  theme: "auto",
  angle: "auto",
  style: "fluent_3d",
  ratio: "3:4",
  language: "ms",
  variations: 1,
  advanced: { showPrice: true, textDensity: "balanced" },
};

/** CTA chosen from the real objective and destination (no "Shop Now" without a checkout). */
export function ctaFor(objective: PosterObjective, language: "ms" | "en" | "mixed", canBuyOnline: boolean): string {
  const ms = language === "ms";
  switch (objective) {
    case "sales":
      return canBuyOnline ? (ms ? "Beli Sekarang" : "Shop Now") : ms ? "Tempah Sekarang" : "Order Now";
    case "leads":
      return ms ? "Daftar Sekarang" : "Get Started";
    case "traffic":
      return ms ? "Ketahui Lebih Lanjut" : "Learn More";
    case "engagement":
      return ms ? "Kongsi Pendapat Anda" : "Discover More";
    default:
      return ms ? "Ketahui Lebih Lanjut" : "Discover More";
  }
}

/** Headline guidance: 4–7 words preferred. Returns the word count for UI hints. */
export function headlineWords(h: string) {
  return h.trim().split(/\s+/).filter(Boolean).length;
}
