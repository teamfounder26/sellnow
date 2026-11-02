"use client";
import { useState, useTransition } from "react";
import { Loader2 } from "lucide-react";
import { useT } from "@/lib/i18n/client";
import { submitTransferProofAction } from "@/app/actions/public";

/** Buyer sends a transfer reference / receipt. It never marks the order paid — the seller confirms. */
export function TransferProofForm({ orderId, token }: { orderId: string; token: string }) {
  const t = useT();
  const [pending, start] = useTransition();
  const [done, setDone] = useState<string | null>(null);
  if (done) return <p className="rounded-xl bg-white p-3 text-sm font-semibold">{done}</p>;
  return (
    <form
      className="space-y-2 pt-2"
      action={(form) =>
        start(async () => {
          form.set("orderId", orderId);
          form.set("token", token);
          const r = await submitTransferProofAction(form);
          setDone(r.ok ? t("checkout.proofSent") : t(r.error));
        })
      }
    >
      <input name="reference" required maxLength={80} placeholder={t("checkout.proofRef")} className="h-11 w-full rounded-xl border border-black/10 bg-white px-3" />
      <input name="file" type="file" accept="image/png,image/jpeg,image/webp,application/pdf" className="block w-full text-sm" />
      <button disabled={pending} className="inline-flex h-10 items-center gap-2 rounded-full bg-ink px-4 text-sm font-semibold text-white">{pending && <Loader2 className="size-4 animate-spin" />} {t("checkout.proofSubmit")}</button>
    </form>
  );
}
