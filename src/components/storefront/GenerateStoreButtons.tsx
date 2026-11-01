"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Sparkles, Loader2 } from "lucide-react";
import { Button, Notice } from "@/components/ui";
import { useT } from "@/lib/i18n/client";
import { generateStorefrontAction } from "@/app/actions/storefront";
import { GenerationProgress } from "@/components/ai/GenerationProgress";

export function GenerateStoreButtons({ ai, confirm }: { ai: boolean; confirm?: boolean }) {
  const t = useT();
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const go = (useAI: boolean) => {
    if (confirm && !window.confirm(t("storefront.regenerateConfirm"))) return;
    start(async () => {
      setError(null);
      const r = await generateStorefrontAction(useAI);
      if (!r.ok) setError(r.error);
      router.refresh();
    });
  };
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap justify-center gap-2">
        {ai && (
          <Button onClick={() => go(true)} disabled={pending} variant={confirm ? "secondary" : "primary"} size={confirm ? "sm" : "md"}>
            {pending ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />} {confirm ? t("storefront.regenerate") : t("storefront.generate")}
          </Button>
        )}
        <Button onClick={() => go(false)} disabled={pending} variant="secondary" size={confirm ? "sm" : "md"}>
          {t("onboarding.generateStoreTemplate")}
        </Button>
      </div>
      {pending && !confirm && <GenerationProgress label={t("onboarding.generatingStore")} />}
      {error && <Notice tone="danger">{t(error)}</Notice>}
    </div>
  );
}
