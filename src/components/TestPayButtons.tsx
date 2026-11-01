"use client";
import { useTransition } from "react";
import { Loader2 } from "lucide-react";
import { testGatewayPayAction } from "@/app/actions/public";
import { useT } from "@/lib/i18n/client";
import { Button } from "@/components/ui";

export function TestPayButtons({ orderId, token, back }: { orderId: string; token: string; back: string }) {
  const t = useT();
  const [pending, start] = useTransition();
  const go = (outcome: "paid" | "failed") =>
    start(async () => {
      await testGatewayPayAction(orderId, token, outcome);
      window.location.assign(back);
    });
  return (
    <div className="mt-6 grid gap-2">
      <Button onClick={() => go("paid")} disabled={pending}>
        {pending && <Loader2 className="size-4 animate-spin" />} {t("testpay.pay")}
      </Button>
      <Button variant="secondary" onClick={() => go("failed")} disabled={pending}>
        {t("testpay.fail")}
      </Button>
    </div>
  );
}
