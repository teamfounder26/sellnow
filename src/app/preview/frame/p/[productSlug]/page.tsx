import { notFound } from "next/navigation";
import { getLocale } from "@/lib/i18n/server";
import { ProductDetail } from "@/components/storefront/ProductDetail";
import { loadDraft } from "../../data";

export default async function DraftProductFrame({ params }: { params: Promise<{ productSlug: string }> }) {
  const { productSlug } = await params;
  const { sf, workspace, products, variants } = await loadDraft();
  const product = products.find((p) => p.slug === productSlug);
  if (!product) notFound();
  return (
    <ProductDetail
      content={sf.draftContent}
      theme={sf.draftTheme}
      product={product}
      variants={variants.filter((v) => v.productId === product.id).map((v) => ({ id: v.id, name: v.name, priceSen: v.priceSen, stock: v.stock }))}
      businessName={workspace.name}
      slug={sf.slug}
      locale={await getLocale()}
      mode="preview"
    />
  );
}
