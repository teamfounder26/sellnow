import type { PosterAngle, PosterBrief, PosterCopy, PosterIntel, PosterObjective, PosterRatio, PosterSettings, PosterStyle, PosterTheme } from "@/lib/db/schema";
import type { PosterSpec } from "./render";

export type T = (k: string, p?: Record<string, string | number>) => string;

export type ProductOpt = {
  id: string;
  name: string;
  priceSen: number;
  description: string;
  imageAssetId: string | null;
  allowed: PosterObjective[];
};

export type VersionData = {
  id: string;
  version: number;
  kind: "ai_image" | "layout";
  textMode: "overlay" | "in_image";
  status: "generating" | "succeeded" | "failed";
  artAssetId: string | null;
  imageAssetId: string | null;
  copy: PosterCopy;
  style: PosterStyle;
  error: string | null;
  credits: number;
  createdAt: string;
};

export type PosterData = {
  id: string;
  idx: number;
  theme: PosterTheme;
  angle: PosterAngle;
  style: PosterStyle;
  ratio: PosterRatio;
  status: "draft" | "approved" | "published";
  copy: PosterCopy;
  prompt: string;
  promptEdited: boolean;
  currentVersionId: string | null;
  adId: string | null;
  adStatus: string | null;
  versions: VersionData[];
};

export type ProjectData = {
  id: string;
  productId: string | null;
  status: "brief" | "approved";
  briefBy: "ai" | "rules";
  settings: PosterSettings;
  intel: PosterIntel;
  brief: PosterBrief;
  posters: PosterData[];
};

export type StudioEnv = {
  canEdit: boolean;
  aiConfigured: boolean;
  imageConfigured: boolean;
  credits: number;
  costs: { brief: number; image: number };
  testimonials: number;
  locale: "ms" | "en";
};

export const asset = (id: string | null | undefined) => (id ? `/api/assets/${id}` : null);

/** Builds the composer input for one poster version. */
export function specFor(project: ProjectData, poster: PosterData, v: VersionData | null, priceLabel: string, productName: string): PosterSpec | null {
  if (!v || v.status !== "succeeded") return null;
  const concept = project.brief.concepts[poster.idx] ?? project.brief.concepts[0];
  const ti = concept?.theme === "testimonial" ? concept.testimonialIndex : null;
  return {
    ratio: poster.ratio,
    theme: poster.theme,
    copy: v.copy,
    kind: v.kind,
    textMode: v.textMode,
    artUrl: asset(v.artAssetId),
    logoUrl: asset(project.settings.advanced.logoAssetId),
    brandColors: project.settings.advanced.brandColors ?? [],
    priceLabel: project.settings.advanced.showPrice === false ? null : priceLabel,
    productName,
    testimonial: ti != null ? (project.brief.evidence.testimonials[ti] ?? null) : null,
  };
}
