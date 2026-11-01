import type { products as productsTable, StorefrontContent, StorefrontTheme } from "@/lib/db/schema";
import type { Category } from "@/lib/categories";
import { translate, type Locale } from "@/lib/i18n/translate";
import { section } from "@/lib/storefront/sections";
import { buildTheme, type DesignPresetId, DESIGN_PRESETS } from "./design";
import { WEBSITE_TYPES, type WebsiteTypeId } from "./types";

type Product = typeof productsTable.$inferSelect;

/**
 * Representative EXAMPLE content for the STORE-step previews. Clearly labelled as an example in the UI;
 * it is not the seller's website and contains no claims about any real business.
 */
export function sampleSite(typeId: WebsiteTypeId, presetId: DesignPresetId, locale: Locale): { content: StorefrontContent; theme: StorefrontTheme; products: Product[]; businessName: string } {
  const t = (k: string) => translate(locale, k);
  const type = WEBSITE_TYPES[typeId];
  const category: Category = type.categories[0]!;
  const n = type.layout === "catalog" ? 8 : 1;
  const now = new Date();
  const products: Product[] = Array.from({ length: n }).map((_, i) => ({
    id: `sample_${i}`,
    workspaceId: "sample",
    type: category,
    name: t(`preview.sample.product`) + (n > 1 ? ` ${i + 1}` : ""),
    slug: `sample-${i}`,
    description: t("preview.sample.productDesc"),
    priceSen: [4900, 2900, 3900, 5900, 1900, 6900, 2500, 3500][i]!,
    compareAtSen: i === 0 ? 6900 : null,
    sku: null,
    weightG: null,
    trackStock: false,
    stock: 0,
    status: "active",
    costSen: null,
    collection: n > 1 ? t(i % 2 ? "preview.sample.collectionB" : "preview.sample.collectionA") : null,
    imageAssetId: null,
    attributes: {},
    createdAt: now,
    updatedAt: now,
  }));
  const build: Record<string, () => ReturnType<typeof section>> = {
    hero: () => section("hero", { headline: t(`preview.sample.headline.${type.layout}`), subheadline: t("preview.sample.sub"), cta: "" }),
    problem_solution: () => section("problem_solution", { problem: t("preview.sample.problem"), solution: t("preview.sample.solution") }),
    benefits: () => section("benefits", { title: t("storefront.template.benefitsTitle"), items: [1, 2, 3].map((i) => ({ title: t(`preview.sample.benefit${i}`), body: t("preview.sample.benefitBody") })) }),
    showcase: () => section("showcase", { title: t("storefront.template.showcaseTitle") }),
    catalog: () => section("catalog", { title: t("website.catalogTitle"), showSearch: true }),
    details: () => section("details", { title: t("website.detailsTitle"), items: [{ label: t("website.details.duration"), value: "90 min" }, { label: t("website.details.location"), value: "Kuala Lumpur" }] }),
    offer: () => section("offer", { title: t("preview.sample.offer"), body: t("preview.sample.offerBody") }),
    pricing: () => section("pricing", { title: t("storefront.template.pricingTitle") }),
    social_proof: () => section("social_proof", { title: "", testimonials: [], confirmed: false }, false),
    faq: () => section("faq", { title: t("storefront.template.faqTitle"), items: [1, 2].map((i) => ({ q: t(`preview.sample.q${i}`), a: t(`preview.sample.a${i}`) })) }),
    contact: () => section("contact", { title: t(`website.contact.${type.modules.includes("interest") ? "interest" : "enquiry"}Title`), body: "", mode: type.modules.includes("interest") ? "interest" : "enquiry" }),
    cta: () => section("cta", { headline: t("preview.sample.closing"), button: "" }),
  };
  const preset = DESIGN_PRESETS[presetId] ? presetId : "modern";
  return {
    businessName: t("preview.sample.business"),
    theme: buildTheme(preset, {}),
    products,
    content: {
      sections: type.blueprint.map((k) => build[k]!()),
      productIds: products.map((p) => p.id),
      websiteType: typeId,
      salesMode: type.modules.includes("checkout") ? "checkout" : "enquiry",
      policies: {},
    },
  };
}
