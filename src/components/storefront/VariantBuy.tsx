"use client";
import { useState } from "react";
import { useLocale, useT } from "@/lib/i18n/client";
import { formatMYR } from "@/lib/money";
import { useCart } from "./Cart";

export function VariantBuy({
  product,
  variants,
  useCart: cartMode,
  checkoutHref,
  primary,
  onPrimary,
}: {
  product: { id: string; name: string; priceSen: number; imageAssetId: string | null; soldOut: boolean; trackStock: boolean };
  variants: { id: string; name: string; priceSen: number; stock: number }[];
  useCart: boolean;
  checkoutHref: string | null;
  primary: string;
  onPrimary: string;
}) {
  const t = useT();
  const locale = useLocale();
  const cart = useCart();
  const firstAvailable = variants.find((v) => !product.trackStock || v.stock > 0) ?? variants[0];
  const [variantId, setVariantId] = useState<string | null>(firstAvailable?.id ?? null);
  const v = variants.find((x) => x.id === variantId);
  const soldOut = product.soldOut || (v ? product.trackStock && v.stock <= 0 : false);
  const btn = "inline-flex h-12 items-center justify-center rounded-[var(--sf-radius-btn)] px-7 font-bold transition hover:brightness-95 disabled:opacity-50";
  return (
    <div className="space-y-4">
      {variants.length > 0 && (
        <div className="flex flex-wrap gap-2" role="radiogroup" aria-label={t("checkout.variant")}>
          {variants.map((x) => (
            <button
              key={x.id}
              type="button"
              role="radio"
              aria-checked={x.id === variantId}
              disabled={product.trackStock && x.stock <= 0}
              onClick={() => setVariantId(x.id)}
              className="rounded-[var(--sf-radius-btn)] px-4 py-2 text-sm font-semibold ring-1 ring-current/20 disabled:opacity-40"
              style={x.id === variantId ? { background: primary, color: onPrimary } : undefined}
            >
              {x.name} · {formatMYR(x.priceSen, locale)}
            </button>
          ))}
        </div>
      )}
      {cartMode && cart ? (
        <button type="button" disabled={soldOut} onClick={() => cart.add({ productId: product.id, variantId, name: v ? `${product.name} — ${v.name}` : product.name, priceSen: v?.priceSen ?? product.priceSen, imageAssetId: product.imageAssetId })} className={btn} style={{ background: primary, color: onPrimary }}>
          {soldOut ? t("store.soldOut") : t("store.addToCart")}
        </button>
      ) : checkoutHref ? (
        <a href={soldOut ? undefined : checkoutHref} aria-disabled={soldOut} className={btn} style={{ background: primary, color: onPrimary }}>
          {soldOut ? t("store.soldOut") : t("storefront.template.cta.full")}
        </a>
      ) : (
        <button type="button" disabled className={btn} style={{ background: primary, color: onPrimary }}>
          {t("storefront.template.cta.full")}
        </button>
      )}
    </div>
  );
}
