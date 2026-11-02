"use client";
import { useEffect, useMemo, useState, useTransition } from "react";
import { Loader2, Lock, ShieldCheck } from "lucide-react";
import { useT, useLocale } from "@/lib/i18n/client";
import { formatMYR } from "@/lib/money";
import { checkoutAction, quoteAction } from "@/app/actions/public";
import type { Quote } from "@/lib/commerce/quote";

type P = { id: string; name: string; type: string; priceSen: number; imageAssetId: string | null; fulfillment: "shipping" | "pickup" | "both" | null; trackStock: boolean; stock: number };
/** Cart line as displayed; prices shown here are informational — the server quote is authoritative. */
export type CartLineView = { productId: string; variantId: string | null; quantity: number; name: string; type: string; imageAssetId: string | null; fulfillment: "shipping" | "pickup" | "both" | null };

export function CheckoutForm(props: {
  slug: string;
  accent: string;
  cancelled: boolean;
  provider: { name: string; isTest: boolean } | null;
  /** Buyer payment options (server truth). Online = Selltro Pay (or a legacy gateway). */
  methods?: { online: boolean; cod: { enabled: boolean; feeSen: number }; manual: { enabled: boolean } };
  product: P;
  variants: { id: string; name: string; priceSen: number; stock: number }[];
  bump: { id: string; name: string; priceSen: number; type: string } | null;
  states: string[];
  /** Multi-product cart (ecommerce). When set, the single-product pickers are replaced by the cart list. */
  cart?: CartLineView[];
  onAccent?: string;
}) {
  const t = useT();
  const locale = useLocale();
  const { product } = props;
  const physical = props.cart ? props.cart.some((c) => c.type === "physical") : product.type === "physical";
  const canChooseDelivery = props.cart ? props.cart.some((c) => c.fulfillment === "both") && !props.cart.some((c) => c.fulfillment === "shipping") : product.fulfillment === "both";
  const [variantId, setVariantId] = useState<string | null>(props.variants[0]?.id ?? null);
  const [qty, setQty] = useState(1);
  const [bump, setBump] = useState(false);
  const [coupon, setCoupon] = useState("");
  const [appliedCoupon, setAppliedCoupon] = useState<string | null>(null);
  const [delivery, setDelivery] = useState<"shipping" | "pickup">(product.fulfillment === "pickup" ? "pickup" : "shipping");
  const [quote, setQuote] = useState<Quote | null>(null);
  const methods = props.methods ?? { online: Boolean(props.provider), cod: { enabled: false, feeSen: 0 }, manual: { enabled: false } };
  const available = ([methods.online && "online", methods.cod.enabled && physical && "cod", methods.manual.enabled && "manual_transfer"].filter(Boolean) as ("online" | "cod" | "manual_transfer")[]);
  const [payMethod, setPayMethod] = useState<"online" | "cod" | "manual_transfer">(available[0] ?? "online");
  const [dest, setDest] = useState<{ postcode: string; state: string }>({ postcode: "", state: "" });
  const destination = /^\d{5}$/.test(dest.postcode) && dest.state ? dest : null;
  const [quoteError, setQuoteError] = useState<string | null>(null);
  const [error, setError] = useState<{ code: string; params?: Record<string, string | number> } | null>(props.cancelled ? { code: "checkout.cancelled" } : null);
  const [pending, start] = useTransition();
  // One idempotency key per checkout attempt — double clicks / retries reuse it.
  const [idempotencyKey, setKey] = useState(() => crypto.randomUUID());

  const lines = useMemo(
    () => [
      ...(props.cart ? props.cart.map((c) => ({ productId: c.productId, variantId: c.variantId, quantity: c.quantity })) : [{ productId: product.id, variantId, quantity: qty }]),
      ...(bump && props.bump ? [{ productId: props.bump.id, variantId: null, quantity: 1 }] : []),
    ],
    [product.id, variantId, qty, bump, props.bump, props.cart],
  );

  useEffect(() => {
    let live = true;
    void quoteAction(props.slug, { lines, couponCode: appliedCoupon, deliveryMethod: physical ? delivery : null, destination, paymentMethod: payMethod }).then((r) => {
      if (!live) return;
      if (r.ok) {
        setQuote(r.quote);
        setQuoteError(null);
      } else {
        setQuoteError(t(r.error, r.params));
        if (r.error === "checkout.badCoupon") setAppliedCoupon(null);
      }
    });
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lines, appliedCoupon, delivery, physical, props.slug, t, destination?.postcode, destination?.state, payMethod]);

  const submit = (form: FormData) =>
    start(async () => {
      setError(null);
      const needsAddress = quote?.requiresShippingAddress;
      let adRef: string | null = null;
      try {
        adRef = sessionStorage.getItem(`sn_ad_${props.slug}`);
      } catch {
        /* storage unavailable */
      }
      const r = await checkoutAction(props.slug, {
        idempotencyKey,
        adRef: adRef && /^ad_[a-z0-9]{16}$/.test(adRef) ? adRef : null,
        lines,
        couponCode: appliedCoupon,
        deliveryMethod: physical ? delivery : null,
        paymentMethod: payMethod,
        customer: {
          name: String(form.get("name") ?? ""),
          email: String(form.get("email") ?? ""),
          phone: String(form.get("phone") ?? ""),
          marketingConsent: form.get("consent") === "on",
        },
        address: needsAddress
          ? {
              line1: String(form.get("line1") ?? ""),
              line2: String(form.get("line2") ?? "") || undefined,
              postcode: String(form.get("postcode") ?? ""),
              city: String(form.get("city") ?? ""),
              state: String(form.get("state") ?? "") as never,
            }
          : null,
      });
      if (r.ok) window.location.assign(r.redirectUrl);
      else {
        setError({ code: r.error, params: r.params });
        // Business-rule failures produce no order; allow a fresh attempt.
        if (r.error !== "checkout.alreadySubmitted") setKey(crypto.randomUUID());
      }
    });

  const input = "h-11 w-full rounded-xl border border-black/10 bg-white px-3.5 text-[15px] focus:outline-none focus:ring-4 focus:ring-black/5";
  const label = "mb-1 block text-sm font-semibold";

  if (!available.length) return <p className="mt-6 rounded-2xl bg-white p-5 font-semibold ring-1 ring-black/5">{t("checkout.paymentsUnavailable")}</p>;

  return (
    <form action={submit} className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_380px]">
      <div className="space-y-5">
        {error && <p className="rounded-2xl bg-red-50 px-4 py-3 text-sm font-medium text-red-700">{t(error.code, error.params)}</p>}
        {props.provider?.isTest && payMethod === "online" && <p className="rounded-2xl bg-amber-50 px-4 py-3 text-sm font-medium text-amber-800">{t("checkout.testModeNote")}</p>}
        <fieldset className="space-y-3 rounded-3xl bg-white p-5 ring-1 ring-black/5">
          <legend className="sr-only">{t("checkout.yourDetails")}</legend>
          <p className="text-lg font-bold">{t("checkout.yourDetails")}</p>
          <div>
            <label className={label} htmlFor="co-name">{t("checkout.name")}</label>
            <input id="co-name" name="name" required minLength={2} autoComplete="name" className={input} />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className={label} htmlFor="co-email">{t("checkout.email")}</label>
              <input id="co-email" name="email" type="email" required autoComplete="email" className={input} />
            </div>
            <div>
              <label className={label} htmlFor="co-phone">{t("checkout.phone")}</label>
              <input id="co-phone" name="phone" type="tel" inputMode="tel" autoComplete="tel" placeholder={t("checkout.phoneHelp")} className={input} />
            </div>
          </div>
          <label className="flex items-start gap-2 text-sm opacity-80">
            <input type="checkbox" name="consent" className="mt-1" /> {t("checkout.marketingConsent")}
          </label>
        </fieldset>

        {physical && (
          <fieldset className="space-y-3 rounded-3xl bg-white p-5 ring-1 ring-black/5">
            <p className="text-lg font-bold">{t("checkout.delivery")}</p>
            {canChooseDelivery && (
              <div className="flex gap-2">
                {(["shipping", "pickup"] as const).map((d) => (
                  <button key={d} type="button" onClick={() => setDelivery(d)} className={`h-10 flex-1 rounded-xl text-sm font-semibold ring-1 ${delivery === d ? "bg-black text-white ring-black" : "ring-black/10"}`}>
                    {t(`checkout.${d}`)}
                  </button>
                ))}
              </div>
            )}
            {quote?.requiresShippingAddress && (
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="sm:col-span-2">
                  <label className={label} htmlFor="co-l1">{t("checkout.line1")}</label>
                  <input id="co-l1" name="line1" required autoComplete="address-line1" className={input} />
                </div>
                <div className="sm:col-span-2">
                  <label className={label} htmlFor="co-l2">{t("checkout.line2")}</label>
                  <input id="co-l2" name="line2" autoComplete="address-line2" className={input} />
                </div>
                <div>
                  <label className={label} htmlFor="co-pc">{t("checkout.postcode")}</label>
                  <input id="co-pc" name="postcode" required inputMode="numeric" pattern="\d{5}" maxLength={5} autoComplete="postal-code" className={input} value={dest.postcode} onChange={(e) => setDest({ ...dest, postcode: e.target.value.replace(/\D/g, "") })} />
                </div>
                <div>
                  <label className={label} htmlFor="co-city">{t("checkout.city")}</label>
                  <input id="co-city" name="city" required autoComplete="address-level2" className={input} />
                </div>
                <div>
                  <label className={label} htmlFor="co-state">{t("checkout.state")}</label>
                  <select id="co-state" name="state" required className={input} value={dest.state} onChange={(e) => setDest({ ...dest, state: e.target.value })}>
                    <option value="" disabled>—</option>
                    {props.states.map((s) => (
                      <option key={s} value={s}>{s}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className={label}>{t("checkout.country")}</label>
                  <input value="Malaysia" disabled className={`${input} opacity-60`} />
                </div>
              </div>
            )}
          </fieldset>
        )}
      </div>

      {available.length > 0 && (
        <fieldset className="space-y-2 rounded-3xl bg-white p-5 ring-1 ring-black/5 lg:col-start-1">
          <legend className="px-1 text-lg font-bold">{t("checkout.payWith")}</legend>
          {available.map((m) => (
            <label key={m} className="flex cursor-pointer items-start gap-3 rounded-2xl p-3 ring-1 ring-black/10 has-[:checked]:ring-2 has-[:checked]:ring-black/40">
              <input type="radio" name="paymethod" className="mt-1" checked={payMethod === m} onChange={() => setPayMethod(m)} />
              <span>
                <span className="block font-semibold">{t(`checkout.method.${m}`)}</span>
                <span className="block text-xs opacity-70">{m === "online" ? (props.provider?.name ?? "Selltro Pay") : m === "cod" ? t("checkout.codHint", { fee: formatMYR(methods.cod.feeSen, locale) }) : t("checkout.manualHint")}</span>
              </span>
            </label>
          ))}
        </fieldset>
      )}

      <aside className="h-fit space-y-4 rounded-3xl bg-white p-5 ring-1 ring-black/5 lg:col-start-2 lg:row-span-2 lg:row-start-1 lg:sticky lg:top-6">
        <p className="text-lg font-bold">{t("checkout.summary")}</p>
        {props.cart ? (
          <ul className="space-y-3">
            {props.cart.map((c) => {
              const q = quote?.lines.find((l) => l.productId === c.productId && (l.variantId ?? null) === c.variantId);
              return (
                <li key={`${c.productId}:${c.variantId}`} className="flex items-center gap-3">
                  {c.imageAssetId ? <img src={`/api/assets/${c.imageAssetId}`} alt="" className="size-12 rounded-xl object-cover" /> : <span className="size-12 rounded-xl bg-black/5" />}
                  <span className="flex-1 text-sm">
                    <span className="block font-semibold">{c.name}</span>
                    <span className="opacity-60">× {c.quantity}</span>
                  </span>
                  {q && <span className="text-sm font-bold">{formatMYR(q.unitPriceSen * q.quantity, locale)}</span>}
                </li>
              );
            })}
          </ul>
        ) : (
        <div className="flex gap-3">
          {product.imageAssetId && <img src={`/api/assets/${product.imageAssetId}`} alt="" className="size-16 rounded-xl object-cover" />}
          <div className="flex-1">
            <p className="font-semibold">{product.name}</p>
            {props.variants.length > 0 && (
              <select aria-label={t("checkout.variant")} value={variantId ?? ""} onChange={(e) => setVariantId(e.target.value)} className={`${input} mt-2 h-9 text-sm`}>
                {props.variants.map((v) => (
                  <option key={v.id} value={v.id} disabled={v.stock <= 0 && product.trackStock}>
                    {v.name} — {formatMYR(v.priceSen, locale)}
                  </option>
                ))}
              </select>
            )}
            {physical && (
              <label className="mt-2 flex items-center gap-2 text-sm">
                {t("checkout.quantity")}
                <input type="number" min={1} max={99} value={qty} onChange={(e) => setQty(Math.max(1, Math.min(99, Number(e.target.value) || 1)))} className={`${input} h-9 w-20`} />
              </label>
            )}
          </div>
        </div>
        )}
        {props.bump && (
          <label className="flex items-start gap-2 rounded-2xl border border-dashed border-black/15 p-3 text-sm">
            <input type="checkbox" checked={bump} onChange={(e) => setBump(e.target.checked)} className="mt-1" />
            <span>
              <b>{t("checkout.addBump")}:</b> {props.bump.name} — {formatMYR(props.bump.priceSen, locale)}
            </span>
          </label>
        )}
        <div className="flex gap-2">
          <input value={coupon} onChange={(e) => setCoupon(e.target.value)} placeholder={t("checkout.coupon")} className={`${input} h-10`} />
          <button type="button" onClick={() => setAppliedCoupon(coupon.trim() || null)} className="h-10 rounded-xl px-4 text-sm font-bold ring-1 ring-black/10">
            {t("checkout.applyCoupon")}
          </button>
        </div>
        {quoteError && <p className="text-sm text-red-700">{quoteError}</p>}
        {quote && (
          <dl className="space-y-1.5 border-t border-black/5 pt-3 text-sm">
            <div className="flex justify-between"><dt>{t("checkout.subtotal")}</dt><dd>{formatMYR(quote.subtotalSen, locale)}</dd></div>
            {quote.discountSen > 0 && <div className="flex justify-between text-green-700"><dt>{t("checkout.discount")}</dt><dd>−{formatMYR(quote.discountSen, locale)}</dd></div>}
            {quote.deliveryMethod && <div className="flex justify-between"><dt>{t("checkout.shippingFee")}</dt><dd>{quote.shippingPending ? t("checkout.shippingAfterAddress") : formatMYR(quote.shippingSen, locale)}</dd></div>}
            {quote.codFeeSen > 0 && <div className="flex justify-between"><dt>{t("checkout.codFee")}</dt><dd>{formatMYR(quote.codFeeSen, locale)}</dd></div>}
            <div className="flex justify-between pt-1 text-lg font-extrabold"><dt>{t("checkout.total")}</dt><dd>{formatMYR(quote.totalSen, locale)}</dd></div>
          </dl>
        )}
        <button disabled={pending || !quote || Boolean(quoteError) || (quote.shippingPending && !destination)} className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-full font-bold shadow-[inset_0_-2px_0_rgb(0_0_0/0.1)] disabled:opacity-50" style={{ background: props.accent, color: props.onAccent ?? "#171717" }}>
          {pending ? <Loader2 className="size-4 animate-spin" /> : <Lock className="size-4" />}
          {pending ? t("checkout.processing") : payMethod === "online" ? t("checkout.pay", { amount: quote ? formatMYR(quote.totalSen, locale) : "" }) : t("checkout.placeOrder", { amount: quote ? formatMYR(quote.totalSen, locale) : "" })}
        </button>
        <p className="flex items-start gap-1.5 text-xs opacity-70">
          <ShieldCheck className="mt-0.5 size-3.5 shrink-0" /> {payMethod === "online" ? t("checkout.secureNote", { provider: props.provider?.name ?? "Selltro Pay" }) : t(`checkout.method.${payMethod}`)}
        </p>
      </aside>
    </form>
  );
}
