"use client";
import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui";
import { useT } from "@/lib/i18n/client";
import { setOptOutAction } from "@/app/actions/orders";

export function OptOutToggle({ customerId, optedOut }: { customerId: string; optedOut: boolean }) {
  const t = useT();
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <Button
      size="sm"
      variant="secondary"
      disabled={pending}
      onClick={() =>
        start(async () => {
          await setOptOutAction(customerId, !optedOut);
          router.refresh();
        })
      }
    >
      {optedOut ? t("customers.optIn") : t("customers.optOut")}
    </Button>
  );
}
