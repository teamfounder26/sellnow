"use client";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { Languages } from "lucide-react";
import { useLocale, useT } from "@/lib/i18n/client";
import clsx from "clsx";

export function LanguageSwitcher({ className }: { className?: string }) {
  const locale = useLocale();
  const t = useT();
  const router = useRouter();
  const [pending, start] = useTransition();
  const set = (l: "ms" | "en") =>
    start(async () => {
      await fetch("/api/locale", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ locale: l }) });
      router.refresh();
    });
  return (
    <div className={clsx("inline-flex items-center gap-1 rounded-pill border border-line bg-surface p-0.5 text-xs font-semibold", pending && "opacity-60", className)} role="group" aria-label={t("common.language")}>
      <Languages className="ml-1.5 size-3.5 text-muted" aria-hidden />
      {(["ms", "en"] as const).map((l) => (
        <button key={l} type="button" onClick={() => set(l)} aria-pressed={locale === l} className={clsx("rounded-pill px-2.5 py-1 transition", locale === l ? "bg-ink text-white" : "text-muted hover:text-ink")}>
          {l === "ms" ? "BM" : "EN"}
        </button>
      ))}
    </div>
  );
}
