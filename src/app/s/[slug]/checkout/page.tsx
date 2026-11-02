import { notFound } from "next/navigation";
import Link from "next/link";
import { and, asc, eq } from "drizzle-orm";
import { ArrowLeft } from "lucide-react";
import { getDb } from "@/lib/db";
import { getPublicStorefront } from "@/lib/storefront/service";
import { productVariants, products } from "@/lib/db/schema";
import { checkoutPaymentOptions } from "@/lib/commerce/checkout";
import { selltroEnvironment } from "@/lib/finance/selltro-pay";
import { getPaymentIntegration } from "@/lib/payments/integrations";
import { ENGINES } from "@/lib/categories";
import { getT } from "@/lib/i18n/server";
import { CheckoutForm, type CartLineView } from "@/components/storefront/CheckoutForm";
import { onColor } from "@/lib/website/design";
import { storefrontPixelId } from "@/lib/ads/pixel";
import { MetaPixel } from "@/components/storefront/MetaPixel";
import { MY_STATES } from "@/lib/commerce/checkout";

export const metadata = { title: "Checkout" };

export default async function CheckoutPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ product?: string; cancelled?: string; cart?: string }> }) {
  const { slug } = await params;
  const { product: productId, cancelled, cart: cartParam } = await searchParams;
  const db = await getDb();
  const pub = await getPublicStorefront(db, slug);
  if (!pub) notFound();
  const { t } = await getT();
  // Cart lines ("productId:variantId:qty,…") are parsed for display only; the server re-quotes everything.
  const cart: CartLineView[] = [];
  for (const part of (cartParam ?? "").split(",").slice(0, 20)) {
    const [pid, vid, q] = part.split(":");
    const pr = pub.products.find((x) => x.id === pid);
    const qty = Math.max(1, Math.min(99, parseInt(q ?? "1", 10) || 1));
    if (pr && ENGINES[pr.type].checkout === "full") cart.push({ productId: pr.id, variantId: vid || null, quantity: qty, name: pr.name, type: pr.type, imageAssetId: pr.imageAssetId, fulfillment: pr.attributes.fulfillment ?? null });
  }
  if (cart.length) {
    const vids = cart.map((c) => c.variantId).filter((v): v is string => Boolean(v));
    if (vids.length) {
      const vs = await db.query.productVariants.findMany({ where: eq(productVariants.workspaceId, pub.storefront.workspaceId) });
      for (const c of cart) if (c.variantId) c.name = `${c.name} — ${vs.find((v) => v.id === c.variantId)?.name ?? ""}`;
    }
  }
  const enquiryOnly = pub.version.content.salesMode === "enquiry";
  const product = (cart.length ? pub.products.find((p) => p.id === cart[0]!.productId) : pub.products.find((p) => p.id === productId)) ?? pub.products.find((p) => ENGINES[p.type].checkout === "full");
  if (enquiryOnly || !product || ENGINES[product.type].checkout !== "full") {
    return (
      <div className="mx-auto max-w-lg px-5 py-20 text-center">
        <p className="text-lg font-bold">{t(enquiryOnly ? "checkout.enquiryOnly" : "checkout.notPurchasable")}</p>
        <Link href={`/s/${slug}#enquiry`} className="mt-4 inline-block font-semibold underline">{t("order.backToStore")}</Link>
      </div>
    );
  }
  const variants = await db.query.productVariants.findMany({ where: and(eq(productVariants.productId, product.id), eq(productVariants.workspaceId, pub.storefront.workspaceId)), orderBy: asc(productVariants.position) });
  const bumpId = pub.version.content.orderBumpProductId;
  const bump = bumpId && bumpId !== product.id ? await db.query.products.findFirst({ where: and(eq(products.id, bumpId), eq(products.workspaceId, pub.storefront.workspaceId), eq(products.status, "active")) }) : null;
  const integration = await getPaymentIntegration(db, pub.storefront.workspaceId);
  const options = await checkoutPaymentOptions(db, pub.storefront.workspaceId);
  const selltroEnv = selltroEnvironment();
  const theme = pub.version.theme;
  const pixelId = await storefrontPixelId(db, pub.storefront.workspaceId);

  return (
    <div style={{ background: theme.background, color: theme.text }} className="min-h-dvh">
      {pixelId && <MetaPixel pixelId={pixelId} event={{ name: "InitiateCheckout" }} />}
      <div className="mx-auto max-w-5xl px-5 py-6">
        <Link href={`/s/${slug}`} className="inline-flex items-center gap-1.5 text-sm font-semibold opacity-70 hover:opacity-100">
          <ArrowLeft className="size-4" /> {pub.workspace.name}
        </Link>
        <h1 className="mt-4 text-3xl font-extrabold tracking-tight">{t("checkout.title")}</h1>
        <CheckoutForm
          slug={slug}
          accent={theme.primary}
          cancelled={Boolean(cancelled)}
          provider={options.selltro ? { name: "Selltro Pay", isTest: selltroEnv !== "live" } : integration ? { name: integration.provider === "test" ? "SellNow Test Gateway" : integration.provider === "stripe" ? "Stripe" : "Billplz", isTest: integration.provider === "test" || integration.mode === "test" } : null}
          methods={{ online: options.online, cod: { enabled: options.cod.enabled, feeSen: options.cod.feeSen }, manual: { enabled: options.manual.enabled } }}
          product={{ id: product.id, name: product.name, type: product.type, priceSen: product.priceSen, imageAssetId: product.imageAssetId, fulfillment: product.attributes.fulfillment ?? null, trackStock: product.trackStock, stock: product.stock }}
          variants={variants.map((v) => ({ id: v.id, name: v.name, priceSen: v.priceSen, stock: v.stock }))}
          bump={bump && ENGINES[bump.type].checkout === "full" ? { id: bump.id, name: bump.name, priceSen: bump.priceSen, type: bump.type } : null}
          states={[...MY_STATES]}
          cart={cart.length ? cart : undefined}
          onAccent={theme.onPrimary ?? onColor(theme.primary)}
        />
      </div>
    </div>
  );
}
