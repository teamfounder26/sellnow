"use client";
import { useMemo, useState } from "react";
import { Package, Search } from "lucide-react";
import { useLocale, useT } from "@/lib/i18n/client";
import { formatMYR } from "@/lib/money";
import { AddToCart } from "./Cart";

export type CatalogProduct = { id: string; slug: string; name: string; description: string; priceSen: number; compareAtSen: number | null; imageAssetId: string | null; collection: string | null; soldOut: boolean; hasVariants: boolean };

/** Ecommerce catalog: search + collection filter + add to cart / product page. Data is the real catalog. */
export function CatalogGrid({
  products,
  showSearch,
  base,
  theme,
  sellOnline,
  enquiryHref,
  narrow,
}: {
  products: CatalogProduct[];
  showSearch: boolean;
  base: string | null;
  theme: { primary: string; onPrimary: string; accent: string };
  sellOnline: boolean;
  enquiryHref: string;
  narrow?: boolean;
}) {
  const t = useT();
  const locale = useLocale();
  const [q, setQ] = useState("");
  const [col, setCol] = useState<string | null>(null);
  const collections = useMemo(() => [...new Set(products.map((p) => p.collection).filter((c): c is string => Boolean(c)))], [products]);
  const shown = products.filter((p) => (!col || p.collection === col) && (!q || `${p.name} ${p.description}`.toLowerCase().includes(q.toLowerCase())));
  return (
    <div>
      {(showSearch || collections.length > 0) && (
        <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-center">
          {showSearch && (
            <label className="relative flex-1">
              <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 opacity-50" />
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("store.search")} className="h-11 w-full rounded-full bg-white pl-10 pr-4 text-[15px] text-[#171717] ring-1 ring-black/10 focus:outline-none focus:ring-2" style={{ ["--tw-ring-color" as string]: theme.primary }} />
            </label>
          )}
          {collections.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {[null, ...collections].map((c) => (
                <button key={c ?? "all"} type="button" onClick={() => setCol(c)} aria-pressed={col === c} className="rounded-full px-3.5 py-1.5 text-sm font-semibold ring-1 ring-current/15" style={col === c ? { background: theme.primary, color: theme.onPrimary } : undefined}>
                  {c ?? t("store.all")}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
      {shown.length === 0 ? (
        <p className="mt-8 text-center opacity-60">{t("store.noResults")}</p>
      ) : (
        <div className={`mt-6 grid gap-4 ${narrow ? "grid-cols-2" : "grid-cols-2 md:grid-cols-3 lg:grid-cols-4"}`}>
          {shown.map((p) => {
            const href = base ? `${base}/p/${p.slug}` : undefined;
            return (
              <div key={p.id} className="group flex flex-col overflow-hidden rounded-[var(--sf-radius)] bg-white text-[#171717] ring-1 ring-black/5 transition hover:-translate-y-0.5 hover:shadow-lg">
                <a href={href} className="relative block aspect-square overflow-hidden" style={{ background: `${theme.accent}33` }}>
                  {p.imageAssetId ? <img src={`/api/assets/${p.imageAssetId}`} alt={p.name} className="h-full w-full object-cover transition duration-500 group-hover:scale-105" /> : <Package className="absolute left-1/2 top-1/2 size-10 -translate-x-1/2 -translate-y-1/2 opacity-25" />}
                  {p.soldOut && <span className="absolute left-2 top-2 rounded-full bg-black/75 px-2 py-0.5 text-xs font-bold text-white">{t("store.soldOut")}</span>}
                </a>
                <div className="flex flex-1 flex-col p-3.5">
                  <a href={href} className="line-clamp-2 font-semibold leading-snug hover:underline">
                    {p.name}
                  </a>
                  <p className="mt-1 text-sm font-extrabold">
                    {formatMYR(p.priceSen, locale)}
                    {p.compareAtSen ? <s className="ml-1.5 text-xs font-medium opacity-50">{formatMYR(p.compareAtSen, locale)}</s> : null}
                  </p>
                  <div className="mt-auto pt-3">
                    {!sellOnline ? (
                      <a href={enquiryHref} className="block rounded-[var(--sf-radius-btn)] py-2 text-center text-sm font-bold ring-1 ring-black/10">
                        {t("store.enquire")}
                      </a>
                    ) : p.hasVariants && href ? (
                      <a href={href} className="block rounded-[var(--sf-radius-btn)] py-2 text-center text-sm font-bold" style={{ background: theme.primary, color: theme.onPrimary }}>
                        {t("store.chooseOptions")}
                      </a>
                    ) : (
                      <AddToCart item={{ productId: p.id, variantId: null, name: p.name, priceSen: p.priceSen, imageAssetId: p.imageAssetId }} primary={theme.primary} onPrimary={theme.onPrimary} label={t("store.addToCart")} disabled={p.soldOut} />
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
