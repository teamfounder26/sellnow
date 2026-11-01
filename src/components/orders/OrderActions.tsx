"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Truck, Undo2 } from "lucide-react";
import { Button, Card, Field, Input, Notice } from "@/components/ui";
import { useT } from "@/lib/i18n/client";
import { markFulfilledAction, refundOrderAction } from "@/app/actions/orders";
import { senToInput } from "@/lib/money";

export function OrderActions({ orderId, provider, isTest, canFulfill, canRefund, remainingSen }: { orderId: string; provider: string; isTest: boolean; canFulfill: boolean; canRefund: boolean; remainingSen: number }) {
  const t = useT();
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [refunding, setRefunding] = useState(false);
  const [amount, setAmount] = useState(senToInput(remainingSen));
  if (!canFulfill && !canRefund) return null;
  const run = (fn: () => Promise<{ ok: boolean; error?: string }>) =>
    start(async () => {
      setError(null);
      const r = await fn();
      if (!r.ok) setError(r.error ?? "errors.unexpected");
      else setRefunding(false);
      router.refresh();
    });
  return (
    <Card className="space-y-3 p-5">
      {error && <Notice tone="danger">{t(error)}</Notice>}
      {canFulfill && (
        <Button className="w-full" onClick={() => run(() => markFulfilledAction(orderId))} disabled={pending}>
          <Truck className="size-4" /> {t("orders.markFulfilled")}
        </Button>
      )}
      {canRefund && !refunding && (
        <Button variant="secondary" className="w-full" onClick={() => setRefunding(true)}>
          <Undo2 className="size-4" /> {t("orders.refund")}
        </Button>
      )}
      {refunding && (
        <div className="space-y-3 rounded-2xl border border-danger/30 p-3">
          <Notice tone="warning">{isTest ? t("orders.refundTest") : provider === "stripe" ? t("orders.refundStripe") : t("orders.refundManual")}</Notice>
          <Field label={t("orders.refundAmount")}>
            <Input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} />
          </Field>
          <div className="flex gap-2">
            <Button variant="danger" size="sm" onClick={() => run(() => refundOrderAction(orderId, amount))} disabled={pending}>
              {pending && <Loader2 className="size-4 animate-spin" />} {t("orders.refundConfirm")}
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setRefunding(false)}>{t("common.cancel")}</Button>
          </div>
        </div>
      )}
    </Card>
  );
}
