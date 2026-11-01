"use client";
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { Minus, Plus, ShoppingBag, X } from "lucide-react";
import { useLocale, useT } from "@/lib/i18n/client";
import { formatMYR } from "@/lib/money";

export type CartItem = { productId: string; variantId: string | null; name: string; priceSen: number; imageAssetId: string | null; quantity: number };
type Ctx = { items: CartItem[]; add: (i: Omit<CartItem, "quantity">, qty?: number) => void; setQty: (productId: string, variantId: string | null, qty: number) => void; open: boolean; setOpen: (o: boolean) => void };

const CartCtx = createContext<Ctx | null>(null);

/**
 * Client-side cart, persisted per store in localStorage (a visitor convenience only). Prices shown
 * are informational: checkout re-quotes every line on the server from the catalog.
 */
export function CartProvider({ slug, children, disabled }: { slug: string; children: React.ReactNode; disabled?: boolean }) {
  const key = `sn_cart_${slug}`;
  const [items, setItems] = useState<CartItem[]>([]);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (disabled) return;
    try {
      const raw = localStorage.getItem(key);
      if (raw) setItems((JSON.parse(raw) as CartItem[]).slice(0, 20));
    } catch {
      /* storage unavailable */
    }
  }, [key, disabled]);
  const persist = useCallback(
    (next: CartItem[]) => {
      setItems(next);
      if (disabled) return;
      try {
        localStorage.setItem(key, JSON.stringify(next));
      } catch {
        /* ignore */
      }
    },
    [key, disabled],
  );
  const add = useCallback<Ctx["add"]>(
    (i, qty = 1) => {
      const ex = items.find((x) => x.productId === i.productId && x.variantId === i.variantId);
      persist(ex ? items.map((x) => (x === ex ? { ...x, quantity: Math.min(99, x.quantity + qty) } : x)) : [...items, { ...i, quantity: qty }].slice(0, 20));
      setOpen(true);
    },
    [items, persist],
  );
  const setQty = useCallback<Ctx["setQty"]>((pid, vid, q) => persist(q <= 0 ? items.filter((x) => !(x.productId === pid && x.variantId === vid)) : items.map((x) => (x.productId === pid && x.variantId === vid ? { ...x, quantity: Math.min(99, q) } : x))), [items, persist]);
  const value = useMemo(() => ({ items, add, setQty, open, setOpen }), [items, add, setQty, open]);
  return <CartCtx.Provider value={value}>{children}</CartCtx.Provider>;
}

export function useCart() {
  return useContext(CartCtx);
}

export function encodeCart(items: CartItem[]) {
  return items.map((i) => `${i.productId}:${i.variantId ?? ""}:${i.quantity}`).join(",");
}

export function CartButton({ color }: { color: string }) {
  const cart = useCart();
  const t = useT();
  if (!cart) return null;
  const n = cart.items.reduce((a, i) => a + i.quantity, 0);
  return (
    <button type="button" onClick={() => cart.setOpen(true)} className="relative grid size-10 place-items-center rounded-full ring-1 ring-current/15 hover:bg-black/5" aria-label={t("store.cart.open", { n })}>
      <ShoppingBag className="size-5" />
      {n > 0 && (
        <span className="absolute -right-1 -top-1 grid min-w-5 place-items-center rounded-full px-1 text-[11px] font-bold text-white" style={{ background: color }}>
          {n}
        </span>
      )}
    </button>
  );
}

export function AddToCart({ item, primary, onPrimary, label, disabled }: { item: Omit<CartItem, "quantity">; primary: string; onPrimary: string; label: string; disabled?: boolean }) {
  const cart = useCart();
  return (
    <button type="button" disabled={disabled || !cart} onClick={() => cart?.add(item)} className="rounded-[var(--sf-radius-btn)] px-4 py-2 text-sm font-bold transition hover:brightness-95 disabled:opacity-50" style={{ background: primary, color: onPrimary }}>
      {label}
    </button>
  );
}

export function CartDrawer({ checkoutHref, primary, onPrimary, previewNote }: { checkoutHref: string | null; primary: string; onPrimary: string; previewNote?: string }) {
  const cart = useCart();
  const t = useT();
  const locale = useLocale();
  if (!cart?.open) return null;
  const total = cart.items.reduce((a, i) => a + i.priceSen * i.quantity, 0);
  return (
    <div className="fixed inset-0 z-50" role="dialog" aria-modal="true" aria-label={t("store.cart.title")}>
      <div className="absolute inset-0 bg-black/30" onClick={() => cart.setOpen(false)} />
      <div className="absolute inset-y-0 right-0 flex w-full max-w-sm flex-col bg-white text-[#171717] shadow-2xl">
        <div className="flex items-center justify-between border-b border-black/5 p-4">
          <p className="text-lg font-bold">{t("store.cart.title")}</p>
          <button type="button" onClick={() => cart.setOpen(false)} className="grid size-9 place-items-center rounded-full hover:bg-black/5" aria-label={t("common.close")}>
            <X className="size-5" />
          </button>
        </div>
        {cart.items.length === 0 ? (
          <p className="p-6 text-center text-sm opacity-60">{t("store.cart.empty")}</p>
        ) : (
          <ul className="flex-1 divide-y divide-black/5 overflow-y-auto">
            {cart.items.map((i) => (
              <li key={`${i.productId}:${i.variantId}`} className="flex gap-3 p-4">
                {i.imageAssetId ? <img src={`/api/assets/${i.imageAssetId}`} alt="" className="size-16 rounded-xl object-cover" /> : <span className="size-16 rounded-xl bg-black/5" />}
                <div className="flex-1">
                  <p className="font-semibold">{i.name}</p>
                  <p className="text-sm opacity-60">{formatMYR(i.priceSen, locale)}</p>
                  <div className="mt-2 inline-flex items-center gap-1 rounded-full ring-1 ring-black/10">
                    <button type="button" className="grid size-8 place-items-center" onClick={() => cart.setQty(i.productId, i.variantId, i.quantity - 1)} aria-label={t("store.cart.less")}>
                      <Minus className="size-3.5" />
                    </button>
                    <span className="w-6 text-center text-sm font-bold tabular-nums">{i.quantity}</span>
                    <button type="button" className="grid size-8 place-items-center" onClick={() => cart.setQty(i.productId, i.variantId, i.quantity + 1)} aria-label={t("store.cart.more")}>
                      <Plus className="size-3.5" />
                    </button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
        {cart.items.length > 0 && (
          <div className="space-y-2 border-t border-black/5 p-4">
            <div className="flex justify-between font-bold">
              <span>{t("store.cart.estimated")}</span>
              <span>{formatMYR(total, locale)}</span>
            </div>
            <p className="text-xs opacity-60">{t("store.cart.finalAtCheckout")}</p>
            {checkoutHref ? (
              <a href={`${checkoutHref}?cart=${encodeURIComponent(encodeCart(cart.items))}`} className="flex h-12 items-center justify-center rounded-full font-bold" style={{ background: primary, color: onPrimary }}>
                {t("store.cart.checkout")}
              </a>
            ) : (
              <p className="rounded-xl bg-amber-50 p-3 text-center text-sm text-amber-800">{previewNote}</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
