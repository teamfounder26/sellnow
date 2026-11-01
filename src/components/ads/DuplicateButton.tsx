"use client";
import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Copy, Loader2 } from "lucide-react";
import { useT } from "@/lib/i18n/client";
import { duplicateAdAction } from "@/app/actions/ads";
import { Button } from "@/components/ui";

/** Copies an ad into a new draft. Publishing the copy uses a new slot (it's a new ad). */
export function DuplicateButton({ adId }: { adId: string }) {
  const t = useT();
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <Button size="sm" variant="ghost" disabled={pending} title={t("ads.actions.duplicateNote")} onClick={() => start(async () => { const r = await duplicateAdAction(adId); if (r.ok) router.push(`/dashboard/creative?tab=create&ad=${r.data.id}`); })}>
      {pending ? <Loader2 className="size-4 animate-spin" /> : <Copy className="size-4" />} {t("ads.actions.duplicate")}
    </Button>
  );
}
