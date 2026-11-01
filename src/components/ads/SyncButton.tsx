"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, RefreshCw } from "lucide-react";
import { useT } from "@/lib/i18n/client";
import { syncAdsAction } from "@/app/actions/ads";

export function SyncButton({ disabled }: { disabled?: boolean }) {
  const t = useT();
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  return (
    <span className="inline-flex items-center gap-2">
      <button
        type="button"
        disabled={disabled || pending}
        title={disabled ? t("ads.syncNeedsMeta") : undefined}
        onClick={() =>
          start(async () => {
            const r = await syncAdsAction();
            setMsg(r.ok ? t("ads.synced", { n: r.data.synced }) : t(r.error));
            router.refresh();
          })
        }
        className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-white px-2.5 text-xs font-semibold ring-1 ring-line disabled:opacity-50"
      >
        {pending ? <Loader2 className="size-3.5 animate-spin" /> : <RefreshCw className="size-3.5" />} {t("ads.syncNow")}
      </button>
      {msg && <span className="text-xs text-muted">{msg}</span>}
    </span>
  );
}
