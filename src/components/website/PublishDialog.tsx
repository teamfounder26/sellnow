"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertCircle, Check, Copy, ExternalLink, LayoutDashboard, Loader2, MessageSquare, Rocket, ShieldCheck, X } from "lucide-react";
import { useT } from "@/lib/i18n/client";
import { checkPublishAction, publishStorefrontAction, setContactEmailAction, setSalesModeAction } from "@/app/actions/storefront";
import { Button, Input, Notice, cx } from "@/components/ui";
import { Celebrate } from "@/components/achievements/Celebrate";

type Issue = { code: string; params?: Record<string, string> };

const FIX: Record<string, string> = {
  "publish.emailUnverified": "/dashboard/settings",
  "publish.paymentNotConnected": "/dashboard/settings?tab=payments",
  "publish.refundPolicy": "/dashboard/storefront?tab=policies",
  "publish.shippingPolicy": "/dashboard/storefront?tab=policies",
  "publish.noProducts": "/dashboard/storefront",
  "publish.heroHeadline": "/dashboard/storefront",
  "publish.testimonialsUnconfirmed": "/dashboard/storefront",
  "publish.digitalFile": "/dashboard/products",
  "publish.fulfillment": "/dashboard/products",
  "publish.productPrice": "/dashboard/products",
  "publish.outOfStock": "/dashboard/products",
  "publish.planRequired": "/dashboard/settings?tab=billing",
};

/** Publish flow: validate → show blocking issues (with fixes) → confirm → publish → success. */
export function PublishDialog({ onClose, liveUrl, initialSalesMode }: { onClose: () => void; liveUrl: string; initialSalesMode: "checkout" | "enquiry" }) {
  const t = useT();
  const router = useRouter();
  const [phase, setPhase] = useState<"checking" | "review" | "publishing" | "live">("checking");
  const [issues, setIssues] = useState<Issue[]>([]);
  const [mode, setMode] = useState(initialSalesMode);
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [paymentConnected, setPaymentConnected] = useState(true);

  const check = async () => {
    setPhase("checking");
    setError(null);
    const r = await checkPublishAction();
    if (!r.ok) {
      setError(t(r.error));
      setPhase("review");
      return;
    }
    setIssues(r.data.issues as Issue[]);
    setMode(r.data.salesMode);
    setPaymentConnected(r.data.paymentConnected);
    setPhase("review");
  };
  useEffect(() => {
    void check();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const switchMode = async (m: "checkout" | "enquiry") => {
    setMode(m);
    await setSalesModeAction(m);
    await check();
  };

  const saveEmail = async () => {
    const r = await setContactEmailAction(email);
    if (!r.ok) setError(t(r.error));
    else await check();
  };

  const publish = async () => {
    setPhase("publishing");
    setError(null);
    const r = await publishStorefrontAction();
    if (!r.ok) {
      setError(t(r.error));
      setPhase("review");
    } else if ("issues" in r.data) {
      setIssues(r.data.issues as Issue[]);
      setPhase("review");
    } else {
      setPhase("live");
      router.refresh();
    }
  };

  const blocking = issues.filter((i) => !(mode === "enquiry" && i.code === "publish.paymentNotConnected"));
  // Offer the choice whenever no gateway is connected (also lets the seller switch back from enquiry mode).
  const paymentMissing = !paymentConnected || mode === "enquiry";

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-ink/40 p-3 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="publish-title">
      {phase === "live" && <Celebrate intensity="big" />}
      <div className="relative max-h-[92dvh] w-full max-w-lg overflow-y-auto rounded-[28px] bg-white p-6 shadow-lift sm:p-8">
        <button type="button" onClick={onClose} className="absolute right-4 top-4 grid size-9 place-items-center rounded-full hover:bg-canvas" aria-label={t("common.close")}>
          <X className="size-5" />
        </button>

        {phase === "live" ? (
          <div className="text-center">
            <span className="mx-auto grid size-16 place-items-center rounded-full bg-success text-white shadow-[0_10px_30px_-10px_rgb(21_128_61/0.6)]">
              <Check className="size-8" />
            </span>
            <h2 id="publish-title" className="mt-5 text-3xl font-extrabold tracking-tight">{t("publishFlow.liveTitle")}</h2>
            <p className="mt-2 text-muted">{t(mode === "enquiry" ? "publishFlow.liveBodyEnquiry" : "publishFlow.liveBody")}</p>
            <p className="mt-4 truncate rounded-xl bg-canvas px-3 py-2 font-mono text-sm">{liveUrl}</p>
            <div className="mt-5 grid gap-2">
              <a href={liveUrl} target="_blank" rel="noreferrer" className="inline-flex h-12 items-center justify-center gap-2 rounded-pill bg-primary font-semibold text-white hover:bg-primary-strong">
                <ExternalLink className="size-4" /> {t("publishFlow.visit")}
              </a>
              <Button
                variant="secondary"
                onClick={async () => {
                  await navigator.clipboard.writeText(liveUrl).catch(() => null);
                  setCopied(true);
                }}
              >
                {copied ? <Check className="size-4" /> : <Copy className="size-4" />} {t(copied ? "publishFlow.copied" : "publishFlow.copy")}
              </Button>
              <Link href="/dashboard" className="inline-flex h-11 items-center justify-center gap-2 rounded-pill text-sm font-semibold text-muted hover:text-ink">
                <LayoutDashboard className="size-4" /> {t("preview.toDashboard")}
              </Link>
            </div>
          </div>
        ) : (
          <>
            <h2 id="publish-title" className="flex items-center gap-2 text-2xl font-extrabold tracking-tight">
              <Rocket className="size-6 text-primary" /> {t("publishFlow.title")}
            </h2>
            <p className="mt-1 text-sm text-muted">{t("publishFlow.sub")}</p>

            {phase === "checking" ? (
              <p className="mt-8 flex items-center justify-center gap-2 py-6 text-muted">
                <Loader2 className="size-5 animate-spin" /> {t("storefront.publishChecking")}
              </p>
            ) : (
              <div className="mt-6 space-y-4">
                {paymentMissing && (
                  <div className="rounded-2xl bg-primary-soft/60 p-4 ring-1 ring-primary/15">
                    <p className="text-sm font-bold">{t("publishFlow.howSell")}</p>
                    <div className="mt-3 grid gap-2">
                      {(["checkout", "enquiry"] as const).map((m) => (
                        <button key={m} type="button" onClick={() => switchMode(m)} className={cx("flex items-start gap-3 rounded-xl bg-white p-3 text-left ring-1 transition", mode === m ? "ring-2 ring-primary" : "ring-line hover:ring-primary/40")}>
                          {m === "checkout" ? <ShieldCheck className="mt-0.5 size-5 shrink-0 text-primary" /> : <MessageSquare className="mt-0.5 size-5 shrink-0 text-primary" />}
                          <span>
                            <span className="block text-sm font-bold">{t(`publishFlow.mode.${m}`)}</span>
                            <span className="block text-xs text-muted">{t(`publishFlow.mode.${m}Desc`)}</span>
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {blocking.length === 0 ? (
                  <Notice tone="success">{t("publishFlow.ready")}</Notice>
                ) : (
                  <div>
                    <p className="text-sm font-bold">{t("publishFlow.blocking", { n: blocking.length })}</p>
                    <ul className="mt-2 space-y-2">
                      {blocking.map((i) => (
                        <li key={i.code + JSON.stringify(i.params ?? {})} className="rounded-xl bg-warning-soft/70 px-3 py-2.5 text-sm">
                          <div className="flex items-start gap-2">
                            <AlertCircle className="mt-0.5 size-4 shrink-0 text-warning" />
                            <span className="flex-1">{t(i.code, i.params)}</span>
                            {FIX[i.code] && (
                              <Link href={FIX[i.code]!} className="shrink-0 font-bold text-primary-strong underline-offset-2 hover:underline">
                                {t("storefront.fix")}
                              </Link>
                            )}
                          </div>
                          {i.code === "publish.contactEmail" && (
                            <div className="mt-2 flex gap-2">
                              <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" className="h-10" />
                              <Button size="sm" onClick={saveEmail} disabled={!email.includes("@")}>
                                {t("common.save")}
                              </Button>
                            </div>
                          )}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {error && <Notice tone="danger">{error}</Notice>}
                <Button size="lg" className="w-full" disabled={blocking.length > 0 || phase === "publishing"} onClick={publish}>
                  {phase === "publishing" ? <Loader2 className="size-5 animate-spin" /> : <Rocket className="size-5" />} {t("publishFlow.confirm")}
                </Button>
                <p className="text-center text-xs text-muted">{t("publishFlow.confirmNote")}</p>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
