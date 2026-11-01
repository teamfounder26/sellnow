"use client";
import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, ArrowRight, BadgeCheck, FileSearch, Globe, Loader2, Pencil, RefreshCw, Sparkles, Plus, Trash2, Link2Off } from "lucide-react";
import type { ProfileField } from "@/lib/db/schema";
import { CATEGORIES } from "@/lib/categories";
import { useLocale, useT } from "@/lib/i18n/client";
import { approveProfileAction, goToStageAction, regenerateProfileAction, updateProfileAction } from "@/app/actions/onboarding";
import { formatMYR } from "@/lib/money";
import { Badge, Button, Input, Notice, Textarea, cx } from "@/components/ui";
import { StepHeading, type WizardProps } from "./OnboardingWizard";
import { AIOrb, JobFailed, StageList, useJob } from "./JobProgress";

const GROUPS: { key: string; fields: string[] }[] = [
  { key: "business", fields: ["business_name", "category", "tagline", "short_description"] },
  { key: "offer", fields: ["product_name", "description", "price", "value_proposition", "usp"] },
  { key: "brand", fields: ["target_audience", "brand_tone", "brand_primary", "brand_accent"] },
  { key: "contact", fields: ["contact_email", "contact_phone", "location"] },
];
const LONG = new Set(["short_description", "description", "value_proposition", "usp", "target_audience"]);

function Provenance({ f }: { f?: ProfileField }) {
  const t = useT();
  const s = !f || f.status === "missing" || f.value == null || f.value === "" ? "missing" : f.status;
  const map = {
    user: ["success", BadgeCheck],
    confirmed: ["success", BadgeCheck],
    extracted: ["blue", FileSearch],
    ai_suggested: ["ai", Sparkles],
    missing: ["warning", AlertTriangle],
  } as const;
  const [tone, Icon] = map[s];
  return (
    <Badge tone={tone} className="shrink-0">
      <Icon className="size-3" /> {t(`wizard.profile.provenance.${s}`)}
    </Badge>
  );
}

export function ProfileStep(props: WizardProps) {
  const job = props.jobs.research;
  if (job && ["QUEUED", "PROCESSING", "VALIDATING", "RETRYING"].includes(job.status)) return <Researching job={job} />;
  if (job && job.status === "FAILED") return <ResearchFailed {...props} />;
  return <ProfileReview {...props} />;
}

function Researching({ job: initial }: { job: NonNullable<WizardProps["jobs"]["research"]> }) {
  const t = useT();
  const job = useJob(initial);
  return (
    <div className="flex flex-col items-center gap-8 pt-4 text-center">
      <AIOrb />
      <div>
        <h1 className="text-3xl font-extrabold tracking-tight sm:text-4xl">{t("wizard.research.title")}</h1>
        <p className="mt-2 text-muted">{t("wizard.research.sub")}</p>
      </div>
      <StageList stages={job.stages} ns="wizard.research.stages" />
      {job.status === "RETRYING" && <p className="text-sm text-warning">{t("wizard.research.retrying")}</p>}
    </div>
  );
}

function ResearchFailed(props: WizardProps) {
  const t = useT();
  const router = useRouter();
  return (
    <div className="flex flex-col items-center gap-6 pt-4 text-center">
      <AIOrb active={false} />
      <h1 className="text-3xl font-extrabold tracking-tight">{t("wizard.research.failedTitle")}</h1>
      <StageList stages={props.jobs.research!.stages} ns="wizard.research.stages" />
      <JobFailed
        job={props.jobs.research!}
        backLabel={t("wizard.research.editInput")}
        onBack={async () => {
          await goToStageAction(props.session.id, "details");
          router.refresh();
        }}
      />
      <p className="text-xs text-muted">{t("wizard.research.inputSaved")}</p>
    </div>
  );
}

function ProfileReview({ session, profile, critical, sources, inputs, ai, found }: WizardProps) {
  const t = useT();
  const locale = useLocale();
  const router = useRouter();
  const fields = profile?.fields ?? {};
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const display = (k: string): string => {
    const f = fields[k];
    if (!f || f.status === "missing" || f.value == null || f.value === "") return "";
    if (k === "price") return formatMYR(Number(f.value), locale);
    if (k === "category") return t(`categories.${f.value}`);
    return String(f.value);
  };
  const raw = (k: string) => {
    const f = fields[k];
    if (!f || f.status === "missing" || f.value == null) return "";
    return k === "price" ? (Number(f.value) / 100).toFixed(2) : String(f.value);
  };

  const [values, setValues] = useState<Record<string, string>>(() => Object.fromEntries(GROUPS.flatMap((g) => g.fields).filter((k) => k !== "category").map((k) => [k, raw(k)])));
  const [category, setCategory] = useState<string>(raw("category"));
  const [faq, setFaq] = useState(profile?.faq ?? []);
  const norm = (v: string) => v.toLowerCase().replace(/\s+/g, " ").trim();
  const mainName = norm(values.product_name || raw("product_name"));
  const existing = new Set(found.existing.map(norm));
  const extras = found.products.filter((p) => norm(p.name) !== mainName && !existing.has(norm(p.name)));
  // Slots left on the plan after the main product (which always counts as one if it doesn't exist yet).
  const slots = Math.max(0, found.maxProducts - existing.size - (existing.has(mainName) || !mainName ? 0 : 1));
  const [picked, setPicked] = useState<string[]>(() => extras.slice(0, slots).map((p) => p.name));

  const missingCritical = useMemo(() => [...critical, "category"].filter((k) => !display(k)), [fields]); // eslint-disable-line react-hooks/exhaustive-deps

  const save = async () => {
    const changed = Object.fromEntries(Object.entries(values).filter(([k, v]) => v !== raw(k)));
    const r = await updateProfileAction(changed, faq, category !== raw("category") ? category || null : undefined);
    if (!r.ok) {
      setError(t(r.error, r.params));
      return false;
    }
    return true;
  };

  const onSave = () =>
    start(async () => {
      setError(null);
      if (await save()) {
        setEditing(false);
        router.refresh();
      }
    });

  const approve = () =>
    start(async () => {
      setError(null);
      if (editing && !(await save())) return;
      const r = await approveProfileAction(session.id, picked);
      if (!r.ok) setError(t(r.error, r.params));
      router.refresh();
    });

  const regenerate = () =>
    start(async () => {
      const r = await regenerateProfileAction(session.id);
      if (!r.ok) setError(t(r.error, r.params));
      router.refresh();
    });

  const read = inputs.filter((i) => i.status === "ready");
  const fetched = sources.filter((s) => s.status === "fetched");
  const unreadable = sources.filter((s) => s.status !== "fetched");

  return (
    <div>
      <StepHeading eyebrow={ai.configured ? t("wizard.profile.eyebrowAI") : t("wizard.profile.eyebrowManual")} title={t(ai.configured ? "wizard.profile.title" : "wizard.profile.titleManual")} sub={t("wizard.profile.sub")} />

      {/* What we used */}
      <div className="mb-5 flex flex-wrap justify-center gap-2 text-xs">
        {session.ideaText && <Badge tone="neutral">{t("wizard.profile.used.idea")}</Badge>}
        {read.length > 0 && <Badge tone="neutral">{t("wizard.profile.used.files", { n: read.length })}</Badge>}
        {fetched.map((s) => (
          <Badge key={s.url} tone="blue">
            <Globe className="size-3" /> {new URL(s.url).hostname}
          </Badge>
        ))}
        {unreadable.map((s) => (
          <Badge key={s.url} tone="warning" title={t(`wizard.profile.sourceStatus.${s.status}`)}>
            <Link2Off className="size-3" /> {s.platform !== "website" ? t(`wizard.details.platforms.${s.platform}`) : new URL(s.url).hostname} · {t(`wizard.profile.sourceStatus.${s.status}`)}
          </Badge>
        ))}
      </div>
      {unreadable.some((s) => s.status === "requires_connection") && (
        <Notice tone="blue" className="mb-5">
          {t("wizard.profile.socialLimit")}
        </Notice>
      )}

      {session.question && !display("category") && (
        <Notice tone="ai" className="mb-5">
          <span className="font-semibold">{t("wizard.profile.aiAsks")}</span> {session.question}
        </Notice>
      )}

      <div className="space-y-4">
        {GROUPS.map((g) => (
          <section key={g.key} className="rounded-[24px] bg-white p-5 shadow-soft ring-1 ring-line sm:p-6">
            <h2 className="mb-3 text-sm font-bold uppercase tracking-wider text-muted">{t(`wizard.profile.groups.${g.key}`)}</h2>
            <dl className="divide-y divide-line">
              {g.fields.map((k) => {
                const missing = !display(k);
                const isCritical = critical.includes(k) || k === "category";
                return (
                  <div key={k} className={cx("grid gap-1.5 py-3 sm:grid-cols-[180px_1fr] sm:gap-4", missing && isCritical && "-mx-3 rounded-xl bg-warning-soft/60 px-3")}>
                    <dt className="flex items-center gap-1.5 pt-0.5 text-sm font-semibold text-ink/70">
                      {t(`wizard.profile.fields.${k}`)}
                      {isCritical && <span className="text-accent">*</span>}
                    </dt>
                    <dd className="min-w-0">
                      {editing ? (
                        k === "category" ? (
                          <div className="flex flex-wrap gap-1.5">
                            {CATEGORIES.map((c) => (
                              <button key={c} type="button" onClick={() => setCategory(c)} className={cx("rounded-pill px-3 py-1.5 text-sm font-semibold ring-1 transition", category === c ? "bg-primary text-white ring-primary" : "bg-white ring-line hover:ring-primary/40")}>
                                {t(`categories.${c}`)}
                              </button>
                            ))}
                          </div>
                        ) : k === "brand_primary" || k === "brand_accent" ? (
                          <div className="flex items-center gap-2">
                            <input type="color" value={/^#[0-9a-fA-F]{6}$/.test(values[k] ?? "") ? values[k] : "#1F83D8"} onChange={(e) => setValues((v) => ({ ...v, [k]: e.target.value.toUpperCase() }))} className="h-10 w-12 cursor-pointer rounded-lg border border-line" aria-label={t(`wizard.profile.fields.${k}`)} />
                            <Input value={values[k] ?? ""} onChange={(e) => setValues((v) => ({ ...v, [k]: e.target.value }))} className="max-w-36 font-mono" />
                          </div>
                        ) : LONG.has(k) ? (
                          <Textarea value={values[k] ?? ""} onChange={(e) => setValues((v) => ({ ...v, [k]: e.target.value }))} rows={3} aria-label={t(`wizard.profile.fields.${k}`)} />
                        ) : (
                          <Input value={values[k] ?? ""} onChange={(e) => setValues((v) => ({ ...v, [k]: e.target.value }))} inputMode={k === "price" ? "decimal" : undefined} placeholder={k === "price" ? "19.90" : undefined} aria-label={t(`wizard.profile.fields.${k}`)} />
                        )
                      ) : (
                        <div className="flex flex-wrap items-start justify-between gap-2">
                          {missing ? (
                            <span className="text-[15px] italic text-muted">{t(k === "category" ? "wizard.profile.chooseCategory" : isCritical ? "wizard.profile.missingCritical" : "wizard.profile.missing")}</span>
                          ) : k === "brand_primary" || k === "brand_accent" ? (
                            <span className="inline-flex items-center gap-2 font-mono text-sm">
                              <span className="size-6 rounded-lg ring-1 ring-black/10" style={{ background: display(k) }} /> {display(k)}
                            </span>
                          ) : (
                            <span className="min-w-0 flex-1 whitespace-pre-line break-words text-[15px]">{display(k)}</span>
                          )}
                          <Provenance f={fields[k]} />
                        </div>
                      )}
                    </dd>
                  </div>
                );
              })}
            </dl>
          </section>
        ))}

        {extras.length > 0 && (
          <section className="rounded-[24px] bg-white p-5 shadow-soft ring-1 ring-line sm:p-6">
            <h2 className="text-sm font-bold uppercase tracking-wider text-muted">{t("wizard.profile.found.title")}</h2>
            <p className="mb-3 mt-1 text-sm text-muted">{t("wizard.profile.found.sub")}</p>
            <ul className="space-y-2">
              {extras.map((p) => {
                const on = picked.includes(p.name);
                const full = !on && picked.length >= slots;
                return (
                  <li key={p.name}>
                    <label className={cx("flex cursor-pointer items-start gap-3 rounded-2xl p-3 ring-1 transition", on ? "bg-primary-soft/50 ring-primary/30" : "ring-line", full && "cursor-not-allowed opacity-50")}>
                      <input type="checkbox" className="mt-1 size-4 accent-[#1F83D8]" checked={on} disabled={full} onChange={(e) => setPicked((xs) => (e.target.checked ? [...xs, p.name] : xs.filter((x) => x !== p.name)))} />
                      <span className="min-w-0 flex-1">
                        <span className="block font-semibold">{p.name}</span>
                        {p.description && <span className="block text-sm text-muted">{p.description}</span>}
                      </span>
                      {p.priceSen != null ? (
                        <span className="shrink-0 text-sm font-bold">{formatMYR(p.priceSen, locale)}</span>
                      ) : (
                        <Badge tone="warning" className="shrink-0">
                          {t("wizard.profile.found.noPrice")}
                        </Badge>
                      )}
                    </label>
                  </li>
                );
              })}
            </ul>
            {extras.length > slots && <p className="mt-3 text-xs text-warning">{t("wizard.profile.found.limit", { max: found.maxProducts })}</p>}
            <p className="mt-2 text-xs text-muted">{t("wizard.profile.found.draftNote")}</p>
          </section>
        )}

        <section className="rounded-[24px] bg-white p-5 shadow-soft ring-1 ring-line sm:p-6">
          <h2 className="mb-3 text-sm font-bold uppercase tracking-wider text-muted">{t("wizard.profile.groups.faq")}</h2>
          {faq.length === 0 && !editing && <p className="text-sm text-muted">{t("wizard.profile.noFaq")}</p>}
          <ul className="space-y-3">
            {faq.map((f, i) =>
              editing ? (
                <li key={i} className="space-y-2 rounded-2xl bg-canvas p-3">
                  <Input value={f.q} onChange={(e) => setFaq((xs) => xs.map((x, j) => (j === i ? { ...x, q: e.target.value } : x)))} placeholder={t("storefront.fields.question")} />
                  <Textarea value={f.a} onChange={(e) => setFaq((xs) => xs.map((x, j) => (j === i ? { ...x, a: e.target.value } : x)))} rows={2} placeholder={t("storefront.fields.answer")} />
                  <button type="button" onClick={() => setFaq((xs) => xs.filter((_, j) => j !== i))} className="inline-flex items-center gap-1 text-xs font-semibold text-danger">
                    <Trash2 className="size-3.5" /> {t("common.remove")}
                  </button>
                </li>
              ) : (
                <li key={i}>
                  <p className="font-semibold">{f.q}</p>
                  <p className="text-[15px] text-muted">{f.a}</p>
                </li>
              ),
            )}
          </ul>
          {editing && (
            <Button variant="ghost" size="sm" className="mt-2" onClick={() => setFaq((xs) => [...xs, { q: "", a: "" }])}>
              <Plus className="size-4" /> {t("storefront.fields.addItem")}
            </Button>
          )}
        </section>
      </div>

      {missingCritical.length > 0 && !editing && (
        <Notice tone="warning" className="mt-5">
          {t("wizard.profile.needsInfo", { fields: missingCritical.map((k) => t(`wizard.profile.fields.${k}`)).join(", ") })}
        </Notice>
      )}
      {error && (
        <Notice tone="danger" className="mt-5">
          {error}
        </Notice>
      )}

      <div className="sticky bottom-4 z-20 mt-8">
        <div className="glass mx-auto flex max-w-xl flex-col gap-2 rounded-[22px] p-2 sm:flex-row">
          {editing ? (
            <Button variant="secondary" className="sm:flex-1" onClick={onSave} disabled={pending}>
              {t("common.save")}
            </Button>
          ) : (
            <Button variant="secondary" className="sm:flex-1" onClick={() => setEditing(true)} disabled={pending}>
              <Pencil className="size-4" /> {t("wizard.profile.edit")}
            </Button>
          )}
          <Button className="sm:flex-[1.4]" onClick={approve} disabled={pending}>
            {pending ? <Loader2 className="size-4 animate-spin" /> : <BadgeCheck className="size-4" />} {t("wizard.profile.approve")} <ArrowRight className="size-4" />
          </Button>
        </div>
        {ai.configured && !editing && (
          <button type="button" onClick={regenerate} disabled={pending} className="mx-auto mt-3 flex items-center gap-1.5 text-sm font-semibold text-muted hover:text-primary-strong">
            <RefreshCw className="size-3.5" /> {t("wizard.profile.regenerate")} · {t("common.credits", { n: ai.costs.research })}
          </button>
        )}
      </div>
    </div>
  );
}
