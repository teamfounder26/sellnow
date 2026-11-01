import { notFound } from "next/navigation";
import { getLocale } from "@/lib/i18n/server";
import { isWebsiteType } from "@/lib/website/types";
import { DESIGN_PRESETS, type DesignPresetId } from "@/lib/website/design";
import { sampleSite } from "@/lib/website/samples";
import { StorefrontRenderer } from "@/components/storefront/StorefrontRenderer";

export const metadata = { title: "Example preview" };

/** Representative, clearly-labelled example of a website format (STORE step). Not the seller's site. */
export default async function TemplatePreview({ params, searchParams }: { params: Promise<{ type: string }>; searchParams: Promise<{ preset?: string }> }) {
  const { type } = await params;
  const { preset } = await searchParams;
  if (!isWebsiteType(type)) notFound();
  const presetId = (preset && preset in DESIGN_PRESETS ? preset : "modern") as DesignPresetId;
  const s = sampleSite(type, presetId, await getLocale());
  return <StorefrontRenderer content={s.content} theme={s.theme} products={s.products} businessName={s.businessName} slug="example" locale={await getLocale()} mode="example" />;
}
