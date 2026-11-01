"use client";
import { useActionState, useEffect } from "react";
import { trackLead } from "./MetaPixel";
import { Loader2, CheckCircle2 } from "lucide-react";
import { submitEnquiryAction, type EnquiryState } from "@/app/actions/public";
import { useT } from "@/lib/i18n/client";

export function EnquiryForm({ slug, productId, disabled, accent }: { slug: string; productId: string; disabled?: boolean; accent: string }) {
  const t = useT();
  const [state, action, pending] = useActionState<EnquiryState, FormData>(submitEnquiryAction, undefined);
  useEffect(() => {
    if (state?.ok) trackLead();
  }, [state?.ok]);
  if (state?.ok) {
    return (
      <p className="mt-5 flex items-center gap-2 font-semibold text-green-700">
        <CheckCircle2 className="size-5" /> {t("enquiry.success")}
      </p>
    );
  }
  const input = "h-11 w-full rounded-xl border border-black/10 bg-white px-3.5 text-[15px] focus:outline-none focus:ring-4 focus:ring-black/5";
  return (
    <form action={action} className="mt-5 space-y-3">
      <input type="hidden" name="slug" value={slug} />
      <input type="hidden" name="productId" value={productId} />
      {state?.error && <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">{t(state.error)}</p>}
      <input name="name" required minLength={2} placeholder={t("checkout.name")} className={input} autoComplete="name" />
      <input name="email" type="email" required placeholder={t("checkout.email")} className={input} autoComplete="email" />
      <input name="phone" placeholder={t("checkout.phone")} className={input} autoComplete="tel" />
      <textarea name="message" rows={3} placeholder={t("enquiry.messagePlaceholder")} className={`${input} h-auto py-2.5`} />
      <label className="flex items-start gap-2 text-sm opacity-80">
        <input type="checkbox" name="consent" required className="mt-1" /> {t("enquiry.consent")}
      </label>
      <button disabled={disabled || pending} className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-full font-bold disabled:opacity-50" style={{ background: accent, color: "#171717" }}>
        {pending && <Loader2 className="size-4 animate-spin" />} {t("enquiry.submit")}
      </button>
    </form>
  );
}
