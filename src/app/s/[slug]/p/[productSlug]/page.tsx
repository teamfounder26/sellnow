import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { and, asc, eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { productVariants } from "@/lib/db/schema";
import { getPublicStorefront } from "@/lib/storefront/service";
import { ProductDetail } from "@/components/storefront/ProductDetail";
import { ViewBeacon } from "@/components/storefront/ViewBeacon";
import { getLocale } from "@/lib/i18n/server";
import { storefrontPixelId } from "@/lib/ads/pixel";
import { MetaPixel } from "@/components/storefront/MetaPixel";
import { AdRefCapture } from "@/components/storefront/AdRefCapture";

type P = { params: Promise<{ slug: string; productSlug: string }> };

export async function generateMetadata({ params }: P): Promise<Metadata> {
  const { slug, productSlug } = await params;
  const pub = await getPublicStorefront(await getDb(), slug);
  const p = pub?.products.find((x) => x.slug === productSlug);
  return { title: { absolute: p ? `${p.name} · ${pub!.workspace.name}` : "SellNow" } };
}

/** Public product page — only products on the PUBLISHED version are reachable. */
export default async function PublicProductPage({ params }: P) {
  const { slug, productSlug } = await params;
  const db = await getDb();
  const pub = await getPublicStorefront(db, slug);
  const product = pub?.products.find((p) => p.slug === productSlug);
  if (!pub || !product) notFound();
  const variants = await db.query.productVariants.findMany({ where: and(eq(productVariants.productId, product.id), eq(productVariants.workspaceId, pub.storefront.workspaceId)), orderBy: asc(productVariants.position) });
  const pixelId = await storefrontPixelId(db, pub.storefront.workspaceId);
  return (
    <>
      <ViewBeacon slug={slug} />
      <AdRefCapture slug={slug} />
      {pixelId && <MetaPixel pixelId={pixelId} event={{ name: "ViewContent", value: product.priceSen / 100, currency: "MYR" }} />}
      <ProductDetail content={pub.version.content} theme={pub.version.theme} product={product} variants={variants.map((v) => ({ id: v.id, name: v.name, priceSen: v.priceSen, stock: v.stock }))} businessName={pub.workspace.name} slug={slug} locale={await getLocale()} mode="public" />
    </>
  );
}
