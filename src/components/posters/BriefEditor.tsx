"use client";
import { useEffect, useState } from "react";
import { BadgeCheck, CheckCircle2, Lightbulb, Loader2, Pencil, Plus, RefreshCw, Save, Trash2, TriangleAlert } from "lucide-react";
import type { PosterBrief, PosterIntel, PosterObjective, PosterSource, PosterStyle } from "@/lib/db/schema";
import { POSTER_ANGLES, POSTER_OBJECTIVES, POSTER_STYLES, POSTER_THEMES, headlineWords } from "@/lib/posters/options";
import { formatMYR } from "@/lib/money";
import { Badge, Button, Card, Field, Input, Notice, Select, Textarea, cx } from "@/components/ui";
import type { ProjectData, StudioEnv, T } from "./types";

function Source({ t, s }: { t: T; s: PosterSource | undefined }) {
  if (!s) return null;
  const verified = s === "product" || s === "profile" || s === "storefront";
  return (
    <Badge tone={verified ? "success" : s === "user" ? "blue" : "ai"} className="text-[10px]">
      {verified ? <BadgeCheck className="size-3" /> : null}
      {t(`posters.source.${verified ? "verified" : s}`)}
    </Badge>
  );
}

const lines = (s: string) => s.split("\n").map((x) => x.trim()).filter(Boolean);

/** Step 1 (summary) + Step 3 (creative brief) + Step 4 (approval). */
export function BriefEditor(props: {
  t: T;
  env: StudioEnv;
  project: ProjectData;
  allowed: PosterObjective[];
  pending: boolean;
  onSaveIntel: (intel: PosterIntel) => void;
  onSaveBrief: (brief: PosterBrief) => Promise<boolean>;
  onRegenerate: () => void;
  onApprove: () => void;
}) {
  const { t, env, project } = props;
  const [editing, setEditing] = useState(false);
  const [brief, setBrief] = useState(project.brief);
  const [intel, setIntel] = useState(project.intel);
  const [intelDirty, setIntelDirty] = useState(false);
  useEffect(() => {
    setBrief(project.brief);
    setIntel(project.intel);
    setIntelDirty(false);
    setEditing(false);
  }, [project.brief, project.intel]);
  const dirty = JSON.stringify(brief) !== JSON.stringify(project.brief);
  const approved = project.status === "approved";
  const src = brief.sources;
  const ed = editing && env.canEdit && !props.pending;
  const setConcept = (i: number, fn: (c: PosterBrief["concepts"][number]) => PosterBrief["concepts"][number]) => setBrief({ ...brief, concepts: brief.concepts.map((c, j) => (j === i ? fn(c) : c)) });
  const ii = (k: keyof PosterIntel, v: string | string[]) => (setIntel({ ...intel, [k]: v }), setIntelDirty(true));

  return (
    <div className="space-y-5">
      {/* Product intelligence */}
      <Card className="p-5 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg font-extrabold tracking-tight">{t("posters.intel.title")}</h2>
          <Badge tone={project.briefBy === "ai" ? "ai" : "neutral"}>{t(project.briefBy === "ai" ? "posters.intel.byAI" : "posters.intel.byRules")}</Badge>
        </div>
        <p className="mt-1 text-sm text-muted">{t("posters.intel.sub")}</p>
        <div className="mt-4 grid gap-4 @2xl:grid-cols-2">
          <div className="space-y-2">
            <p className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-success"><BadgeCheck className="size-4" /> {t("posters.intel.facts")}</p>
            <ul className="space-y-1 text-sm">
              {intel.facts.map((f, i) => (
                <li key={i} className="flex gap-2"><span className="w-28 shrink-0 text-muted">{t(`posters.fact.${f.label}`) === `posters.fact.${f.label}` ? f.label.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase()) : t(`posters.fact.${f.label}`)}</span><span className="min-w-0 break-words font-medium">{f.value}</span></li>
              ))}
            </ul>
          </div>
          <div className="space-y-3">
            {(["what", "who", "problem", "solution", "usp"] as const).map((k) => (
              <Field key={k} label={t(`posters.intel.${k}`)}>
                <Textarea rows={2} value={intel[k]} maxLength={400} onChange={(e) => ii(k, e.target.value)} disabled={!env.canEdit || props.pending} />
              </Field>
            ))}
            <Field label={t("posters.intel.benefits")} hint={t("posters.onePerLine")}>
              <Textarea rows={3} value={intel.benefits.join("\n")} onChange={(e) => ii("benefits", lines(e.target.value).slice(0, 6))} disabled={!env.canEdit || props.pending} />
            </Field>
          </div>
        </div>
        {intel.assumptions.length > 0 && (
          <Notice tone="warning" className="mt-4">
            <p className="font-semibold">{t("posters.intel.assumptions")}</p>
            <ul className="mt-1 list-inside list-disc text-sm">{intel.assumptions.map((a, i) => <li key={i}>{a}</li>)}</ul>
          </Notice>
        )}
        {intel.questions.length > 0 && (
          <Notice tone="blue" className="mt-3">
            <p className="font-semibold">{t("posters.intel.questions")}</p>
            <ul className="mt-1 list-inside list-disc text-sm">{intel.questions.map((a, i) => <li key={i}>{a}</li>)}</ul>
            <p className="mt-1 text-xs">{t("posters.intel.questionsHint")}</p>
          </Notice>
        )}
        {intelDirty && env.canEdit && (
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <Button size="sm" onClick={() => props.onSaveIntel(intel)} disabled={props.pending}>{props.pending ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />} {t("posters.intel.update")}</Button>
            <span className="text-xs text-muted">{env.aiConfigured ? t("posters.intel.updateCost", { n: env.costs.brief }) : ""}</span>
          </div>
        )}
      </Card>

      {brief.strategy.recommendation && (
        <Card className="flex gap-3 bg-primary-soft/40 p-5">
          <Lightbulb className="mt-0.5 size-5 shrink-0 text-primary" />
          <div>
            <p className="font-bold">{t("posters.recommendation")}</p>
            <p className="mt-1 text-sm text-ink/80">{brief.strategy.recommendation}</p>
            <p className="mt-2 text-xs text-muted">{t("posters.noGuarantee")}</p>
          </div>
        </Card>
      )}

      {/* Creative brief */}
      <Card className="p-5 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg font-extrabold tracking-tight">{t("posters.brief.title")}</h2>
          {approved ? <Badge tone="success"><CheckCircle2 className="size-3.5" /> {t("posters.brief.approved")}</Badge> : <Badge tone="warning">{t("posters.brief.awaiting")}</Badge>}
        </div>
        <p className="mt-1 text-sm text-muted">{t("posters.brief.sub")}</p>

        <div className="mt-5 grid gap-4 @3xl:grid-cols-3">
          <div className="space-y-2 rounded-2xl bg-canvas p-4">
            <p className="text-xs font-bold uppercase tracking-wider text-muted">{t("posters.brief.product")}</p>
            <p className="font-bold">{brief.product.name} <Source t={t} s="product" /></p>
            <p className="text-sm font-semibold text-primary">{formatMYR(brief.product.priceSen, env.locale)}</p>
            <Field label={<span className="flex items-center gap-1.5">{t("posters.brief.mainBenefit")} <Source t={t} s={src["product.mainBenefit"]} /></span>}>
              <Textarea rows={2} value={brief.product.mainBenefit} disabled={!ed} onChange={(e) => setBrief({ ...brief, product: { ...brief.product, mainBenefit: e.target.value } })} />
            </Field>
          </div>
          <div className="space-y-2 rounded-2xl bg-canvas p-4">
            <p className="text-xs font-bold uppercase tracking-wider text-muted">{t("posters.brief.audience")}</p>
            {(["customer", "problem", "motivation"] as const).map((k) => (
              <Field key={k} label={<span className="flex items-center gap-1.5">{t(`posters.brief.aud.${k}`)} <Source t={t} s={src[`audience.${k}`]} /></span>}>
                <Textarea rows={2} value={brief.audience[k]} disabled={!ed} onChange={(e) => setBrief({ ...brief, audience: { ...brief.audience, [k]: e.target.value } })} />
              </Field>
            ))}
          </div>
          <div className="space-y-2 rounded-2xl bg-canvas p-4">
            <p className="text-xs font-bold uppercase tracking-wider text-muted">{t("posters.brief.strategy")}</p>
            <Field label={<span className="flex items-center gap-1.5">{t("posters.setup.objective")} <Source t={t} s={src["strategy.objective"]} /></span>}>
              <Select value={brief.strategy.objective} disabled={!ed} onChange={(e) => setBrief({ ...brief, strategy: { ...brief.strategy, objective: e.target.value as PosterObjective } })}>
                {POSTER_OBJECTIVES.map((o) => <option key={o} value={o} disabled={!props.allowed.includes(o)}>{t(`posters.objective.${o}`)}</option>)}
              </Select>
            </Field>
            <p className="text-xs font-bold uppercase tracking-wider text-muted">{t("posters.brief.evidence")}</p>
            <ul className="max-h-40 space-y-1 overflow-auto text-xs text-ink/80">
              {brief.evidence.facts.map((f, i) => <li key={i} className="flex gap-1"><BadgeCheck className="mt-0.5 size-3 shrink-0 text-success" />{f}</li>)}
              {brief.evidence.claims.map((f, i) => <li key={`c${i}`} className="flex gap-1"><BadgeCheck className="mt-0.5 size-3 shrink-0 text-primary" />{f}</li>)}
            </ul>
            {brief.evidence.testimonials.length > 0 && <p className="text-xs text-muted">{t("posters.brief.testimonialsN", { n: brief.evidence.testimonials.length })}</p>}
          </div>
        </div>

        <div className="mt-5 space-y-4">
          {brief.concepts.map((c, i) => {
            const words = headlineWords(c.copy.headline);
            return (
              <div key={i} className="rounded-2xl p-4 ring-1 ring-line sm:p-5">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-extrabold">{t("posters.poster", { n: i + 1 })}</span>
                  <Badge tone="blue">{t(`posters.theme.${c.theme}`)}</Badge>
                  <Badge>{t(`posters.angle.${c.angle}`)}</Badge>
                  <Source t={t} s={src[`concepts.${i}`] ?? src.concepts} />
                </div>
                {ed && (
                  <div className="mt-3 grid gap-3 @xl:grid-cols-3">
                    <Field label={t("posters.setup.theme")}>
                      <Select value={c.theme} onChange={(e) => setConcept(i, (x) => ({ ...x, theme: e.target.value as typeof c.theme, testimonialIndex: e.target.value === "testimonial" ? 0 : null }))}>
                        {POSTER_THEMES.map((th) => <option key={th} value={th} disabled={th === "testimonial" && !brief.evidence.testimonials.length}>{t(`posters.theme.${th}`)}</option>)}
                      </Select>
                    </Field>
                    <Field label={t("posters.setup.angle")}>
                      <Select value={c.angle} onChange={(e) => setConcept(i, (x) => ({ ...x, angle: e.target.value as typeof c.angle }))}>
                        {POSTER_ANGLES.map((a) => <option key={a} value={a}>{t(`posters.angle.${a}`)}</option>)}
                      </Select>
                    </Field>
                    <Field label={t("posters.setup.style")}>
                      <Select value={c.visual.style} onChange={(e) => setConcept(i, (x) => ({ ...x, visual: { ...x.visual, style: e.target.value as PosterStyle } }))}>
                        {POSTER_STYLES.map((s) => <option key={s} value={s}>{t(`posters.style.${s}`)}</option>)}
                      </Select>
                    </Field>
                  </div>
                )}
                <div className="mt-3 grid gap-4 @2xl:grid-cols-2">
                  <div className="space-y-3">
                    <p className="text-xs font-bold uppercase tracking-wider text-muted">{t("posters.brief.copy")}</p>
                    <Field label={t("posters.brief.keyMessage")}><Input value={c.keyMessage} disabled={!ed} onChange={(e) => setConcept(i, (x) => ({ ...x, keyMessage: e.target.value }))} /></Field>
                    <Field label={t("posters.brief.headline")} hint={<span className={cx(words > 7 && "text-warning")}>{t("posters.brief.words", { n: words })}</span>}>
                      <Input value={c.copy.headline} maxLength={90} disabled={!ed} onChange={(e) => setConcept(i, (x) => ({ ...x, copy: { ...x.copy, headline: e.target.value } }))} className="font-bold" />
                    </Field>
                    {c.theme === "testimonial" && (
                      <Field label={t("posters.brief.testimonial")}>
                        <Select value={c.testimonialIndex ?? 0} disabled={!ed} onChange={(e) => setConcept(i, (x) => ({ ...x, testimonialIndex: Number(e.target.value) }))}>
                          {brief.evidence.testimonials.map((q, k) => <option key={k} value={k}>&ldquo;{q.quote.slice(0, 60)}&rdquo; — {q.author}</option>)}
                        </Select>
                      </Field>
                    )}
                    <div className="space-y-2">
                      <p className="text-sm font-semibold">{t("posters.brief.body")} <span className="font-normal text-muted">({c.theme === "testimonial" ? "0–2" : "2–4"})</span></p>
                      {c.copy.body.map((b, k) => (
                        <div key={k} className="flex gap-2">
                          <Input value={b} maxLength={140} disabled={!ed} aria-label={`${t("posters.brief.body")} ${k + 1}`} onChange={(e) => setConcept(i, (x) => ({ ...x, copy: { ...x.copy, body: x.copy.body.map((y, j) => (j === k ? e.target.value : y)) } }))} />
                          {ed && <button type="button" aria-label={t("common.remove")} onClick={() => setConcept(i, (x) => ({ ...x, copy: { ...x.copy, body: x.copy.body.filter((_, j) => j !== k) } }))} className="rounded-xl px-2 text-muted hover:text-danger"><Trash2 className="size-4" /></button>}
                        </div>
                      ))}
                      {ed && c.copy.body.length < 4 && <Button size="sm" variant="ghost" onClick={() => setConcept(i, (x) => ({ ...x, copy: { ...x.copy, body: [...x.copy.body, ""] } }))}><Plus className="size-4" /> {t("posters.brief.addPoint")}</Button>}
                    </div>
                    <Field label={t("posters.brief.cta")}><Input value={c.copy.cta} maxLength={30} disabled={!ed} onChange={(e) => setConcept(i, (x) => ({ ...x, copy: { ...x.copy, cta: e.target.value } }))} /></Field>
                  </div>
                  <div className="space-y-3">
                    <p className="text-xs font-bold uppercase tracking-wider text-muted">{t("posters.brief.visual")}</p>
                    <p className="text-sm"><span className="text-muted">{t("posters.setup.style")}:</span> <b>{t(`posters.style.${c.visual.style}`)}</b> · <span className="text-muted">{t("posters.setup.ratio")}:</span> <b>{project.settings.ratio}</b></p>
                    <Field label={t("posters.brief.hero")}><Textarea rows={2} value={c.visual.hero} disabled={!ed} onChange={(e) => setConcept(i, (x) => ({ ...x, visual: { ...x.visual, hero: e.target.value } }))} /></Field>
                    <Field label={t("posters.brief.supporting")} hint={t("posters.onePerLine")}><Textarea rows={3} value={c.visual.supporting.join("\n")} disabled={!ed} onChange={(e) => setConcept(i, (x) => ({ ...x, visual: { ...x.visual, supporting: lines(e.target.value).slice(0, 4) } }))} /></Field>
                    <Field label={t("posters.brief.layout")}><Input value={c.visual.layout} disabled={!ed} onChange={(e) => setConcept(i, (x) => ({ ...x, visual: { ...x.visual, layout: e.target.value } }))} /></Field>
                    <div className="flex flex-wrap items-center gap-2 text-sm">
                      <span className="text-muted">{t("posters.brief.colors")}:</span>
                      {(project.settings.advanced.brandColors?.length ? project.settings.advanced.brandColors : c.visual.colors).map((col) => (
                        <span key={col} className="inline-flex items-center gap-1 text-xs">{/^#/.test(col) && <span className="size-4 rounded-full ring-1 ring-line" style={{ background: col }} />}{col}</span>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {env.canEdit && (
          <div className="mt-6 flex flex-col gap-3 border-t border-line pt-5 @lg:flex-row @lg:flex-wrap @lg:items-center">
            {!editing ? (
              <Button variant="secondary" onClick={() => setEditing(true)} disabled={props.pending}><Pencil className="size-4" /> {t("posters.brief.edit")}</Button>
            ) : (
              <>
                <Button variant="secondary" disabled={!dirty || props.pending} onClick={async () => { if (await props.onSaveBrief(brief)) setEditing(false); }}><Save className="size-4" /> {t("posters.brief.save")}</Button>
                <Button variant="ghost" disabled={props.pending} onClick={() => { setBrief(project.brief); setEditing(false); }}>{t("common.cancel")}</Button>
              </>
            )}
            <Button variant="ghost" onClick={props.onRegenerate} disabled={props.pending}><RefreshCw className="size-4" /> {t("posters.brief.regenerate")}</Button>
            <Button onClick={props.onApprove} disabled={props.pending || dirty || approved} className="@lg:ml-auto">
              {props.pending ? <Loader2 className="size-4 animate-spin" /> : <CheckCircle2 className="size-4" />} {t(approved ? "posters.brief.approved" : "posters.brief.approve")}
            </Button>
          </div>
        )}
        {dirty && <p className="mt-2 flex items-center gap-1.5 text-xs text-warning"><TriangleAlert className="size-3.5" /> {t("posters.brief.unsaved")}</p>}
        {!approved && <p className="mt-2 text-xs text-muted">{t("posters.brief.noCredits")}</p>}
      </Card>
    </div>
  );
}
