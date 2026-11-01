import { Package } from "lucide-react";
import type { StorefrontContent, StorefrontTheme, products as productsTable } from "@/lib/db/schema";
import { ENGINES } from "@/lib/categories";
import { formatMYR } from "@/lib/money";
import { translate, type Locale } from "@/lib/i18n/translate";
import { onColor } from "@/lib/website/design";
import { WEBSITE_TYPES, isWebsiteType } from "@/lib/website/types";
import { StorefrontFrame, type RenderMode } from "./StorefrontRenderer";
import { VariantBuy } from "./VariantBuy";

type Product = typeof productsTable.$inferSelect;

/** Product detail page — same frame/theme as the storefront; buying feeds the same cart/checkout. */
export function ProductDetail({
  content,
  theme,
  product,
  variants,
  businessName,
  slug,
  locale,
  mode,
}: {
  content: StorefrontContent;
  theme: StorefrontTheme;
  product: Product;
  variants: { id: string; name: string; priceSen: number; stock: number }[];
  businessName: string;
  slug: string;
  locale: Locale;
  mode: RenderMode;
}) {
  const t = (k: string, p?: Record<string, string | number>) => translate(locale, k, p);
  const onPrimary = theme.onPrimary ?? onColor(theme.primary);
  const type = isWebsiteType(content.websiteType) ? WEBSITE_TYPES[content.websiteType] : null;
  const sellOnline = content.salesMode !== "enquiry" && ENGINES[product.type].checkout === "full" && type?.availability !== "interest";
  const base = mode === "public" ? `/s/${slug}` : "/preview/frame";
  return (
    <StorefrontFrame content={content} theme={theme} businessName={businessName} slug={slug} locale={locale} mode={mode}>
      <div className="mx-auto max-w-6xl px-5 pb-10">
        <a href={base} className="text-sm font-semibold opacity-70 hover:opacity-100">
          ← {t("store.backToShop")}
        </a>
        <div className="mt-6 grid gap-10 md:grid-cols-2">
          <div className="relative flex aspect-square items-center justify-center overflow-hidden rounded-[var(--sf-radius)]" style={{ background: `${theme.accent}33` }}>
            {product.imageAssetId ? <img src={`/api/assets/${product.imageAssetId}`} alt={product.name} className="h-full w-full object-cover" /> : <Package className="size-16 opacity-25" />}
          </div>
          <div>
            {product.collection && <p className="text-xs font-semibold uppercase tracking-wider opacity-60">{product.collection}</p>}
            <h1 className="mt-2 text-balance text-4xl font-extrabold tracking-tight md:text-5xl">{product.name}</h1>
            {product.priceSen > 0 && (
              <p className="mt-4 text-2xl font-extrabold">
                {formatMYR(product.priceSen, locale)}
                {product.compareAtSen ? <s className="ml-2 text-base font-medium opacity-50">{formatMYR(product.compareAtSen, locale)}</s> : null}
              </p>
            )}
            {product.description && <p className="mt-5 whitespace-pre-line text-[16px] leading-relaxed opacity-80">{product.description}</p>}
            <div className="mt-8">
              {sellOnline ? (
                <VariantBuy
                  product={{ id: product.id, name: product.name, priceSen: product.priceSen, imageAssetId: product.imageAssetId, soldOut: product.trackStock && product.stock <= 0 && variants.length === 0, trackStock: product.trackStock }}
                  variants={variants}
                  useCart={type?.modules.includes("cart") ?? false}
                  checkoutHref={mode === "public" ? `/s/${slug}/checkout?product=${product.id}` : null}
                  primary={theme.primary}
                  onPrimary={onPrimary}
                />
              ) : (
                <a href={`${base}#enquiry`} className="inline-flex h-12 items-center rounded-[var(--sf-radius-btn)] px-7 font-bold" style={{ background: theme.primary, color: onPrimary }}>
                  {t("store.enquire")}
                </a>
              )}
              {mode !== "public" && <p className="mt-3 text-xs opacity-60">{t("store.checkoutDisabledPreview")}</p>}
            </div>
          </div>
        </div>
      </div>
    </StorefrontFrame>
  );
}
