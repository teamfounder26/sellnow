"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Globe, Link2, Loader2, Plus, X, Sparkles } from "lucide-react";
import { useT } from "@/lib/i18n/client";
import { submitDetailsAction } from "@/app/actions/onboarding";
import { Button, Input, Notice, cx } from "@/components/ui";
import { StepHeading, type WizardProps } from "./OnboardingWizard";

/** Client-side mirror of lib/ingest/links detectPlatform — display only; the server re-validates. */
function platformOf(raw: string): "website" | "facebook" | "tiktok" | "instagram" | null {
  const v = raw.trim();
  if (!v) return null;
  try {
    const h = new URL(/^https?:\/\//i.test(v) ? v : `https://${v}`).hostname.replace(/^(www|m|web)\./, "");
    if (/(^|\.)facebook\.com$|^fb\.(com|me)$/.test(h)) return "facebook";
    if (/(^|\.)tiktok\.com$/.test(h)) return "tiktok";
    if (/(^|\.)instagram\.com$/.test(h)) return "instagram";
    return h.includes(".") ? "website" : null;
  } catch {
    return null;
  }
}

function PlatformIcon({ p }: { p: ReturnType<typeof platformOf> }) {
  if (p === "facebook") return <span className="grid size-6 place-items-center rounded-md bg-[#1877F2] text-[13px] font-black text-white">f</span>;
  if (p === "tiktok") return <span className="grid size-6 place-items-center rounded-md bg-ink text-[11px] font-black text-white">♪</span>;
  if (p === "instagram") return <span className="grid size-6 place-items-center rounded-md bg-gradient-to-br from-[#F58529] via-[#DD2A7B] to-[#8134AF] text-[11px] font-black text-white">◎</span>;
  if (p === "website") return <Globe className="size-5 text-primary" />;
  return <Link2 className="size-5 text-muted" />;
}

export function DetailsStep({ session, ai }: WizardProps) {
  const t = useT();
  const router = useRouter();
  const [links, setLinks] = useState<string[]>(session.links.length ? session.links : [""]);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const go = (noLinks: boolean) =>
    start(async () => {
      setError(null);
      const r = await submitDetailsAction(session.id, noLinks ? [] : links.filter((l) => l.trim()), noLinks);
      if (!r.ok) setError(t(r.error, r.params));
      else router.refresh();
    });

  const filled = links.filter((l) => l.trim());
  const social = filled.some((l) => ["facebook", "tiktok", "instagram"].includes(platformOf(l) ?? ""));

  return (
    <div>
      <StepHeading title={t("wizard.details.title")} sub={t("wizard.details.sub")} />
      <div className="glass space-y-3 rounded-[28px] p-4 sm:p-6">
        {links.map((l, i) => {
          const p = platformOf(l);
          return (
            <div key={i} className="flex items-center gap-2">
              <div className="relative flex-1">
                <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2">
                  <PlatformIcon p={p} />
                </span>
                <Input
                  value={l}
                  onChange={(e) => setLinks((xs) => xs.map((x, j) => (j === i ? e.target.value : x)))}
                  placeholder={t(`wizard.details.placeholder${i % 3}`)}
                  inputMode="url"
                  autoCapitalize="off"
                  autoCorrect="off"
                  aria-label={t("wizard.details.linkLabel", { n: i + 1 })}
                  className="h-13 rounded-2xl pl-12 text-[15px]"
                />
                {p && <span className="absolute right-3 top-1/2 -translate-y-1/2 rounded-pill bg-primary-soft px-2 py-0.5 text-[11px] font-bold text-primary-strong">{t(`wizard.details.platforms.${p}`)}</span>}
              </div>
              {links.length > 1 && (
                <button type="button" onClick={() => setLinks((xs) => xs.filter((_, j) => j !== i))} className="grid size-10 place-items-center rounded-full text-muted hover:bg-white" aria-label={t("common.remove")}>
                  <X className="size-4" />
                </button>
              )}
            </div>
          );
        })}
        {links.length < 5 && (
          <button type="button" onClick={() => setLinks((xs) => [...xs, ""])} className="inline-flex items-center gap-1.5 rounded-pill px-3 py-1.5 text-sm font-semibold text-primary-strong hover:bg-primary-soft">
            <Plus className="size-4" /> {t("wizard.details.addLink")}
          </button>
        )}
      </div>

      {social && (
        <Notice tone="blue" className="mt-4">
          {t("wizard.details.socialNote")}
        </Notice>
      )}
      {error && (
        <Notice tone="danger" className="mt-4">
          {error}
        </Notice>
      )}

      <div className="mt-8 flex flex-col items-center gap-3">
        <Button size="lg" className="min-w-60" disabled={pending || filled.length === 0} onClick={() => go(false)}>
          {pending ? <Loader2 className="size-5 animate-spin" /> : <Sparkles className="size-5" />} {t("wizard.details.analyze")} <ArrowRight className="size-5" />
        </Button>
        <button type="button" disabled={pending} onClick={() => go(true)} className={cx("text-sm font-semibold text-muted underline-offset-4 hover:text-ink hover:underline", pending && "opacity-50")}>
          {t("wizard.details.noLink")}
        </button>
        {ai.configured && <p className="text-xs text-muted">{t("wizard.creditsNote", { n: ai.costs.research, balance: ai.credits })}</p>}
      </div>
    </div>
  );
}
