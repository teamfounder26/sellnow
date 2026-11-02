"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Copy, Download, ImageIcon, LayoutTemplate, Loader2, Megaphone, Pencil, RefreshCw, Save, Sparkles, TriangleAlert } from "lucide-react";
import type { PosterStyle } from "@/lib/db/schema";
import { POSTER_STYLES, headlineWords } from "@/lib/posters/options";
import { Badge, Button, Card, Field, Input, Notice, Select, Textarea, cx } from "@/components/ui";
import { editPosterCopyAction, generatePosterAction, savePosterRenderAction, setPosterVersionAction, updatePosterPromptAction, usePosterInAdsAction } from "@/app/actions/posters";
import { PosterCanvas } from "./PosterCanvas";
import { downloadPoster, posterBlob } from "./render";
import { specFor, type PosterData, type ProjectData, type StudioEnv, type T } from "./types";

const key = () => (typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`);

export function PromptCard({ t, env, poster, onGenerate, busy }: { t: T; env: StudioEnv; poster: PosterData; onGenerate: () => void; busy: boolean }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(poster.prompt);
  const [copied, setCopied] = useState(false);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  return (
    <Card className="flex flex-col p-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-extrabold">{t("posters.poster", { n: poster.idx + 1 })}</span>
        <Badge tone="blue">{t(`posters.theme.${poster.theme}`)}</Badge>
        <Badge>{poster.ratio}</Badge>
        {poster.promptEdited && <Badge tone="ai">{t("posters.prompt.edited")}</Badge>}
      </div>
      {editing ? (
        <Textarea rows={14} value={text} onChange={(e) => setText(e.target.value)} className="mt-3 font-mono text-xs" aria-label={t("posters.prompt.title")} />
      ) : (
        <pre className="mt-3 max-h-72 flex-1 overflow-auto whitespace-pre-wrap rounded-xl bg-canvas p-3 font-mono text-xs leading-relaxed text-ink/80">{poster.prompt}</pre>
      )}
      {err && <Notice tone="danger" className="mt-2">{t(err)}</Notice>}
      <div className="mt-3 flex flex-wrap gap-2">
        <Button size="sm" variant="secondary" onClick={() => { void navigator.clipboard.writeText(editing ? text : poster.prompt); setCopied(true); setTimeout(() => setCopied(false), 1500); }}>
          {copied ? <Check className="size-4" /> : <Copy className="size-4" />} {t(copied ? "posters.copied" : "posters.prompt.copy")}
        </Button>
        {env.canEdit && !editing && <Button size="sm" variant="ghost" onClick={() => setEditing(true)}><Pencil className="size-4" /> {t("posters.prompt.edit")}</Button>}
        {env.canEdit && editing && (
          <Button size="sm" variant="ghost" disabled={saving || text.trim().length < 20} onClick={async () => { setSaving(true); const r = await updatePosterPromptAction(poster.id, text); setSaving(false); if (r.ok) { setEditing(false); router.refresh(); } else setErr(r.error); }}>
            {saving ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />} {t("posters.prompt.save")}
          </Button>
        )}
        {env.canEdit && env.imageConfigured && (
          <Button size="sm" onClick={onGenerate} disabled={busy || editing}>{busy ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />} {t("posters.prompt.generate")}</Button>
        )}
      </div>
    </Card>
  );
}

export function PosterCard(props: { t: T; env: StudioEnv; project: ProjectData; poster: PosterData; priceLabel: string; productName: string; busy: boolean; onGenerate: (kind: "ai_image" | "layout", opts?: { textMode?: "overlay" | "in_image"; style?: PosterStyle }) => void; productHasImage: boolean }) {
  const { t, env, poster, project } = props;
  const router = useRouter();
  const current = poster.versions.find((v) => v.id === poster.currentVersionId) ?? null;
  const latest = poster.versions[0] ?? null;
  const [editing, setEditing] = useState(false);
  const [copy, setCopy] = useState(poster.copy);
  const [style, setStyle] = useState<PosterStyle>(poster.style);
  const [msg, setMsg] = useState<{ tone: "success" | "danger" | "warning"; text: string } | null>(null);
  const [working, setWorking] = useState<string | null>(null);
  const spec = specFor(project, poster, current, props.priceLabel, props.productName);
  // Text edits preview live on overlay artwork before saving.
  const previewSpec = spec && editing && current?.textMode === "overlay" ? { ...spec, copy } : spec;
  const name = `${props.productName}-${poster.theme}-v${current?.version ?? 0}`.replace(/[^\w-]+/g, "-").toLowerCase();
  const isPublishedAd = poster.adStatus && poster.adStatus !== "draft";

  const run = async (label: string, fn: () => Promise<void>) => {
    setWorking(label);
    setMsg(null);
    try {
      await fn();
    } finally {
      setWorking(null);
    }
  };

  const saveRender = async () => {
    if (!spec || !current) return null;
    const blob = await posterBlob(spec, current.textMode === "in_image" && current.kind === "ai_image" ? "image/png" : "image/jpeg");
    const fd = new FormData();
    fd.set("file", new File([blob], `${name}.${blob.type === "image/png" ? "png" : "jpg"}`, { type: blob.type }));
    const r = await savePosterRenderAction(current.id, fd);
    if (!r.ok) setMsg({ tone: "danger", text: t(r.error) });
    return r.ok ? r.data.assetId : null;
  };

  return (
    <Card className="overflow-hidden p-4">
      <div className="grid gap-4 @xl:grid-cols-[minmax(0,260px)_minmax(0,1fr)]">
        <div className="space-y-2">
          {previewSpec ? (
            <PosterCanvas spec={previewSpec} scale={0.5} label={poster.copy.headline} />
          ) : (
            <div className="flex aspect-[3/4] flex-col items-center justify-center gap-2 rounded-2xl bg-canvas p-6 text-center text-sm text-muted ring-1 ring-line">
              {latest?.status === "generating" || props.busy ? (
                <><Loader2 className="size-6 animate-spin text-primary" /><span>{t("posters.card.generating")}</span><span className="text-xs">{t("posters.card.generatingHint")}</span></>
              ) : (
                <><ImageIcon className="size-6" /><span>{t("posters.card.notGenerated")}</span></>
              )}
            </div>
          )}
          {poster.versions.length > 0 && (
            <div className="flex flex-wrap gap-1" aria-label={t("posters.card.versions")}>
              {poster.versions.map((v) => (
                <button
                  key={v.id}
                  type="button"
                  disabled={v.status !== "succeeded" || !env.canEdit}
                  onClick={() => run("version", async () => { await setPosterVersionAction(poster.id, v.id); router.refresh(); })}
                  title={v.status === "failed" ? t(v.error ?? "ai.providerError") : `${t(`posters.kind.${v.kind}`)} · ${new Date(v.createdAt).toLocaleString()}`}
                  className={cx("rounded-lg px-2 py-1 text-xs font-semibold ring-1", v.id === poster.currentVersionId ? "bg-primary text-white ring-primary" : v.status === "failed" ? "bg-danger-soft text-danger ring-danger/30" : v.status === "generating" ? "bg-warning-soft text-warning ring-warning/30" : "bg-white ring-line")}
                >
                  v{v.version}
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="min-w-0 space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-extrabold">{t("posters.poster", { n: poster.idx + 1 })}</span>
            <Badge tone="blue">{t(`posters.theme.${poster.theme}`)}</Badge>
            <Badge>{poster.ratio}</Badge>
            <Badge tone={poster.status === "draft" ? "neutral" : "success"}>{t(`posters.status.${isPublishedAd ? "published" : poster.status}`)}</Badge>
            {current && <Badge tone={current.kind === "ai_image" ? "ai" : "neutral"}>{t(`posters.kind.${current.kind}`)}</Badge>}
            {latest?.status === "failed" && <Badge tone="danger">{t("posters.card.failed")}</Badge>}
          </div>
          <p className="text-lg font-extrabold leading-tight">{poster.copy.headline}</p>
          {latest?.status === "failed" && latest.id !== current?.id && <Notice tone="danger">{t(latest.error ?? "ai.providerError")} {latest.credits > 0 ? t("posters.card.refunded", { n: latest.credits }) : ""}</Notice>}
          {current?.textMode === "in_image" && <Notice tone="warning">{t("posters.card.inImageNote")}</Notice>}
          {msg && <Notice tone={msg.tone}>{msg.text}</Notice>}

          {editing ? (
            <div className="space-y-2 rounded-2xl bg-canvas p-3">
              <Field label={t("posters.brief.headline")} hint={t("posters.brief.words", { n: headlineWords(copy.headline) })}><Input value={copy.headline} maxLength={90} onChange={(e) => setCopy({ ...copy, headline: e.target.value })} /></Field>
              <Field label={t("posters.brief.body")} hint={t("posters.onePerLine")}><Textarea rows={4} value={copy.body.join("\n")} onChange={(e) => setCopy({ ...copy, body: e.target.value.split("\n").slice(0, 4) })} /></Field>
              <Field label={t("posters.brief.cta")}><Input value={copy.cta} maxLength={30} onChange={(e) => setCopy({ ...copy, cta: e.target.value })} /></Field>
              <p className="text-xs text-muted">{current?.textMode === "in_image" ? t("posters.card.editNeedsRegen") : t("posters.card.editFree")}</p>
              <div className="flex gap-2">
                <Button size="sm" disabled={Boolean(working)} onClick={() => run("copy", async () => {
                  const r = await editPosterCopyAction(poster.id, { ...copy, body: copy.body.map((b) => b.trim()).filter(Boolean) });
                  if (!r.ok) return setMsg({ tone: "danger", text: t(r.error) });
                  setEditing(false);
                  if (r.data.needsRegeneration) setMsg({ tone: "warning", text: t("posters.card.editNeedsRegen") });
                  router.refresh();
                })}>{working === "copy" ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />} {t("common.save")}</Button>
                <Button size="sm" variant="ghost" onClick={() => { setCopy(poster.copy); setEditing(false); }}>{t("common.cancel")}</Button>
              </div>
            </div>
          ) : (
            env.canEdit && (
              <div className="flex flex-wrap gap-2">
                <Button size="sm" variant="secondary" onClick={() => setEditing(true)}><Pencil className="size-4" /> {t("posters.card.editText")}</Button>
              </div>
            )
          )}

          {env.canEdit && (
            <div className="space-y-2 rounded-2xl p-3 ring-1 ring-line">
              <div className="flex flex-wrap items-end gap-2">
                <label className="min-w-40 flex-1 text-xs font-semibold">
                  {t("posters.card.style")}
                  <Select value={style} onChange={(e) => setStyle(e.target.value as PosterStyle)} className="mt-1 h-9 text-sm">
                    {POSTER_STYLES.map((s) => <option key={s} value={s}>{t(`posters.style.${s}`)}</option>)}
                  </Select>
                </label>
                {env.imageConfigured && (
                  <Button size="sm" disabled={props.busy} onClick={() => props.onGenerate("ai_image", { style })}>
                    {props.busy ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />} {t(current?.kind === "ai_image" ? "posters.card.regenerate" : "posters.card.generateImage")} · {t("posters.credits", { n: env.costs.image })}
                  </Button>
                )}
                {props.productHasImage && (
                  <Button size="sm" variant="secondary" disabled={props.busy} onClick={() => props.onGenerate("layout")}>
                    <LayoutTemplate className="size-4" /> {t("posters.card.layout")}
                  </Button>
                )}
              </div>
              {style !== poster.style && <p className="text-xs text-muted">{t("posters.card.styleNeedsRegen")}</p>}
            </div>
          )}

          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="ghost" onClick={() => { void navigator.clipboard.writeText(poster.prompt); setMsg({ tone: "success", text: t("posters.copied") }); }}><Copy className="size-4" /> {t("posters.prompt.copy")}</Button>
            {spec && (
              <>
                <Button size="sm" variant="ghost" onClick={() => run("png", () => downloadPoster(spec, "image/png", name))}><Download className="size-4" /> PNG</Button>
                <Button size="sm" variant="ghost" onClick={() => run("jpg", () => downloadPoster(spec, "image/jpeg", name))}><Download className="size-4" /> JPG</Button>
              </>
            )}
            {spec && env.canEdit && (
              <Button size="sm" variant="secondary" disabled={Boolean(working)} onClick={() => run("save", async () => { if (await saveRender()) { setMsg({ tone: "success", text: t("posters.card.saved") }); router.refresh(); } })}>
                {working === "save" ? <Loader2 className="size-4 animate-spin" /> : current?.imageAssetId ? <Check className="size-4" /> : <Save className="size-4" />} {t(current?.imageAssetId ? "posters.card.savedShort" : "posters.card.save")}
              </Button>
            )}
            {spec && env.canEdit && (
              <Button size="sm" disabled={Boolean(working)} onClick={() => run("ads", async () => {
                if (!current?.imageAssetId && !(await saveRender())) return;
                const r = await usePosterInAdsAction(poster.id);
                if (!r.ok) return setMsg({ tone: "danger", text: t(r.error) });
                router.push(`/dashboard/creative?tab=create&ad=${r.data.adId}`);
              })}>
                {working === "ads" ? <Loader2 className="size-4 animate-spin" /> : <Megaphone className="size-4" />} {t("posters.card.useInAds")}
              </Button>
            )}
          </div>
          {poster.adId && <p className="flex items-center gap-1.5 text-xs text-muted"><Megaphone className="size-3.5" /> {t("posters.card.linkedAd")} <a className="font-semibold text-primary hover:underline" href={`/dashboard/creative/ads/${poster.adId}`}>{t("posters.card.openAd")}</a></p>}
          <p className="flex items-center gap-1.5 text-xs text-muted"><TriangleAlert className="size-3.5" /> {t("posters.slotsNote")}</p>
        </div>
      </div>
    </Card>
  );
}

export { key as requestKey };
