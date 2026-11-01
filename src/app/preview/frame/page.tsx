import { getLocale } from "@/lib/i18n/server";
import { StorefrontRenderer } from "@/components/storefront/StorefrontRenderer";
import { loadDraft } from "./data";

export const metadata = { title: "Draft preview" };

/** Renders the saved draft with the SAME renderer as the live site (inside the preview top bar's iframe). */
export default async function DraftFrame() {
  const { sf, workspace, products, variants } = await loadDraft();
  return <StorefrontRenderer content={sf.draftContent} theme={sf.draftTheme} products={products} businessName={workspace.name} slug={sf.slug} locale={await getLocale()} mode="preview" variantProductIds={[...new Set(variants.map((v) => v.productId))]} />;
}
