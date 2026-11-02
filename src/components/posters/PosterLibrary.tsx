"use client";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Copy, Download, ExternalLink, Loader2, Megaphone, Search } from "lucide-react";
import { POSTER_THEMES } from "@/lib/posters/options";
import { formatMYR } from "@/lib/money";
import { useT } from "@/lib/i18n/client";
import { Badge, Button, Card, Notice, Select } from "@/components/ui";
import { duplicatePosterAction, usePosterInAdsAction } from "@/app/actions/posters";
import { PosterCanvas } from "./PosterCanvas";
import type { PosterSpec } from "./render";

export type LibraryRow = {
  id: string;
  projectId: string;
  productName: string;
  theme: string;
  status: "draft" | "approved" | "published";
  ratio: string;
  headline: string;
  createdAt: string;
  versionCount: number;
  promptEdited: boolean;
  imageUrl: string | null;
  spec: PosterSpec | null;
  adId: string | null;
  performance: { spendSen: number; purchases: number; cppSen: number | null; roas: number | null; trend: number[] } | null;
};

function Spark({ data }: { data: number[] }) {
  if (data.length < 2) return null;
  const max = Math.max(...data, 1);
  const pts = data.map((v, i) => `${(i / (data.length - 1)) * 100},${30 - (v / max) * 28}`).join(" ");
  return (
    <svg viewBox="0 0 100 30" className="h-6 w-full" preserveAspectRatio="none" aria-hidden>
      <polyline points={pts} fill="none" stroke="currentColor" strokeWidth="2" vectorEffect="non-scaling-stroke" className="text-primary" />
    </svg>
  );
}

export function PosterLibrary({ rows, products, filters, canEdit, locale }: { rows: LibraryRow[]; products: { id: string; name: string }[]; filters: { product?: string; theme?: string; status?: string }; canEdit: boolean; locale: "ms" | "en" }) {
  const t = useT();
  const router = useRouter();
  const [working, setWorking] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const date = new Intl.DateTimeFormat(locale === "ms" ? "ms-MY" : "en-MY", { dateStyle: "medium", timeZone: "Asia/Kuala_Lumpur" });
  const filter = (k: string, v: string) => {
    const sp = new URLSearchParams({ tab: "posters", ...Object.fromEntries(Object.entries({ ...filters, [k]: v }).filter(([, x]) => x)) });
    router.push(`/dashboard/creative?${sp.toString()}#library`);
  };
  const run = async (id: string, fn: () => Promise<void>) => {
    setWorking(id);
    setErr(null);
    await fn();
    setWorking(null);
  };

  return (
    <section id="library" className="@container scroll-mt-24 space-y-4">
      <div className="flex flex-col gap-3 @3xl:flex-row @3xl:items-end @3xl:justify-between">
        <div>
          <h2 className="text-xl font-extrabold tracking-tight">{t("posters.lib.title")}</h2>
          <p className="text-sm text-muted">{t("posters.lib.sub")}</p>
        </div>
        <div className="grid grid-cols-3 gap-2">
          <Select aria-label={t("posters.lib.product")} value={filters.product ?? ""} onChange={(e) => filter("product", e.target.value)} className="h-9 text-sm">
            <option value="">{t("posters.lib.allProducts")}</option>
            {products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </Select>
          <Select aria-label={t("posters.setup.theme")} value={filters.theme ?? ""} onChange={(e) => filter("theme", e.target.value)} className="h-9 text-sm">
            <option value="">{t("posters.lib.allThemes")}</option>
            {POSTER_THEMES.map((x) => <option key={x} value={x}>{t(`posters.theme.${x}`)}</option>)}
          </Select>
          <Select aria-label={t("posters.lib.status")} value={filters.status ?? ""} onChange={(e) => filter("status", e.target.value)} className="h-9 text-sm">
            <option value="">{t("posters.lib.allStatus")}</option>
            {(["draft", "approved", "published"] as const).map((x) => <option key={x} value={x}>{t(`posters.status.${x}`)}</option>)}
          </Select>
        </div>
      </div>
      {err && <Notice tone="danger">{err}</Notice>}
      {rows.length === 0 ? (
        <Card className="flex items-center gap-3 p-5 text-sm text-muted"><Search className="size-4" /> {t("posters.lib.noMatch")}</Card>
      ) : (
        <div className="grid gap-4 @lg:grid-cols-2 @4xl:grid-cols-3">
          {rows.map((r) => (
            <Card key={r.id} className="flex flex-col overflow-hidden p-3">
              <Link href={`/dashboard/creative?tab=posters&project=${r.projectId}`} className="block" aria-label={r.headline}>
                {r.imageUrl ? (
                  <img src={r.imageUrl} alt={r.headline} className="w-full rounded-2xl bg-white ring-1 ring-line" loading="lazy" />
                ) : r.spec ? (
                  <PosterCanvas spec={r.spec} scale={0.3} label={r.headline} />
                ) : (
                  <div className="flex aspect-[3/4] items-center justify-center rounded-2xl bg-canvas p-4 text-center text-sm text-muted ring-1 ring-line">{t("posters.lib.promptOnly")}</div>
                )}
              </Link>
              <div className="mt-3 flex-1 space-y-2 px-1">
                <div className="flex flex-wrap items-center gap-1.5">
                  <Badge tone="blue">{t(`posters.theme.${r.theme}`)}</Badge>
                  <Badge tone={r.status === "published" ? "success" : r.status === "approved" ? "ai" : "neutral"}>{t(`posters.status.${r.status}`)}</Badge>
                  <Badge>{r.ratio}</Badge>
                  {r.promptEdited && <Badge tone="ai">{t("posters.prompt.edited")}</Badge>}
                </div>
                <p className="line-clamp-2 font-bold leading-snug">{r.headline}</p>
                <p className="text-xs text-muted">{r.productName} · {date.format(new Date(r.createdAt))} · {t("posters.lib.versions", { n: r.versionCount })}</p>
                {r.performance && (
                  <div className="rounded-xl bg-canvas p-2.5 text-xs">
                    <div className="grid grid-cols-4 gap-1">
                      {[
                        ["spend", formatMYR(r.performance.spendSen, locale)],
                        ["purchases", String(r.performance.purchases)],
                        ["cpp", r.performance.cppSen != null ? formatMYR(r.performance.cppSen, locale) : t("ads.na")],
                        ["roas", r.performance.roas != null ? r.performance.roas.toFixed(2) : t("ads.na")],
                      ].map(([k, v]) => (
                        <div key={k}><p className="text-muted">{t(`ads.metric.${k}`)}</p><p className="font-bold tabular-nums">{v}</p></div>
                      ))}
                    </div>
                    <Spark data={r.performance.trend} />
                  </div>
                )}
              </div>
              <div className="mt-3 flex flex-wrap gap-1.5 px-1">
                <Link href={`/dashboard/creative?tab=posters&project=${r.projectId}`} className="inline-flex h-8 items-center gap-1 rounded-pill px-3 text-xs font-semibold ring-1 ring-line hover:bg-canvas"><ExternalLink className="size-3.5" /> {t("posters.lib.open")}</Link>
                {r.imageUrl && <a href={r.imageUrl} download className="inline-flex h-8 items-center gap-1 rounded-pill px-3 text-xs font-semibold ring-1 ring-line hover:bg-canvas"><Download className="size-3.5" /> {t("posters.lib.download")}</a>}
                {canEdit && (
                  <Button size="sm" variant="ghost" className="h-8 text-xs" disabled={working === r.id} onClick={() => run(r.id, async () => { const x = await duplicatePosterAction(r.id); if (!x.ok) setErr(t(x.error)); router.refresh(); })}>
                    {working === r.id ? <Loader2 className="size-3.5 animate-spin" /> : <Copy className="size-3.5" />} {t("posters.lib.duplicate")}
                  </Button>
                )}
                {canEdit && r.imageUrl && (
                  <Button size="sm" className="h-8 text-xs" disabled={working === `ad${r.id}`} onClick={() => run(`ad${r.id}`, async () => { const x = await usePosterInAdsAction(r.id); if (!x.ok) setErr(t(x.error)); else router.push(`/dashboard/creative?tab=create&ad=${x.data.adId}`); })}>
                    <Megaphone className="size-3.5" /> {t(r.adId ? "posters.lib.reuse" : "posters.card.useInAds")}
                  </Button>
                )}
              </div>
            </Card>
          ))}
        </div>
      )}
    </section>
  );
}
