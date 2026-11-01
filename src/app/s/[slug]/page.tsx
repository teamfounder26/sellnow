import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { and, inArray, eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { productVariants } from "@/lib/db/schema";
import { getPublicStorefront } from "@/lib/storefront/service";
import { StorefrontRenderer } from "@/components/storefront/StorefrontRenderer";
import { ViewBeacon } from "@/components/storefront/ViewBeacon";
import { getLocale } from "@/lib/i18n/server";
import { storefrontPixelId } from "@/lib/ads/pixel";
import { MetaPixel } from "@/components/storefront/MetaPixel";
import { AdRefCapture } from "@/components/storefront/AdRefCapture";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const pub = await getPublicStorefront(await getDb(), slug);
  return { title: { absolute: pub?.version.content.seoTitle || pub?.workspace.name || "SellNow" } };
}

export default async function PublicStorefront({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const db = await getDb();
  const pub = await getPublicStorefront(db, slug);
  if (!pub) notFound();
  const locale = await getLocale();
  const ids = pub.products.map((p) => p.id);
  const variants = ids.length ? await db.select({ productId: productVariants.productId }).from(productVariants).where(and(eq(productVariants.workspaceId, pub.storefront.workspaceId), inArray(productVariants.productId, ids))) : [];
  const pixelId = await storefrontPixelId(db, pub.storefront.workspaceId);
  return (
    <>
      <ViewBeacon slug={slug} />
      <AdRefCapture slug={slug} />
      {pixelId && <MetaPixel pixelId={pixelId} />}
      <StorefrontRenderer content={pub.version.content} theme={pub.version.theme} products={pub.products} businessName={pub.workspace.name} slug={slug} locale={locale} mode="public" variantProductIds={[...new Set(variants.map((v) => v.productId))]} />
    </>
  );
}
