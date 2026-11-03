import { notFound } from "next/navigation";
import { getLocale } from "@/lib/i18n/server";
import { isWebsiteType } from "@/lib/website/types";
import { DESIGN_PRESETS, type DesignPresetId } from "@/lib/website/design";
import { sampleSite } from "@/lib/website/samples";
import { DEMO_PACKS, isDemoPack } from "@/lib/website/demo-samples";
import { StorefrontRenderer } from "@/components/storefront/StorefrontRenderer";

export const metadata = { title: "Example preview" };

/** Representative, clearly-labelled example of a website format (STORE step). Not the seller's site. */
export default async function TemplatePreview({ params, searchParams }: { params: Promise<{ type: string }>; searchParams: Promise<{ preset?: string; demo?: string }> }) {
  const { type } = await params;
  const { preset, demo } = await searchParams;
  if (!isWebsiteType(type)) notFound();
  const presetId = (preset && preset in DESIGN_PRESETS ? preset : "modern") as DesignPresetId;
  const s = sampleSite(type, presetId, isDemoPack(demo) ? "en" : await getLocale());
  // Sales-page demo: dress the real template with a matching sample pack (still clearly an example).
  if (isDemoPack(demo)) {
    const pack = DEMO_PACKS[demo]!;
    s.businessName = pack.business;
    s.products = s.products.slice(0, Math.max(1, Math.min(s.products.length, pack.products.length))).map((p, i) => ({ ...p, name: pack.products[i % pack.products.length]!.name, description: pack.products[i % pack.products.length]!.desc, priceSen: pack.products[i % pack.products.length]!.priceSen, compareAtSen: null }));
    s.content = { ...s.content, sections: s.content.sections.map((sec) => (sec.type === "hero" ? { ...sec, props: { ...sec.props, headline: pack.headline, subheadline: pack.sub } } : sec)) };
  }
  return <StorefrontRenderer content={s.content} theme={s.theme} products={s.products} businessName={s.businessName} slug="example" locale={await getLocale()} mode="example" />;
}
