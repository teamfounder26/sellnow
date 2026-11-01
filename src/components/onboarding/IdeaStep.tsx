"use client";
import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, FileText, ImagePlus, Loader2, Mic, Paperclip, Sparkles, X, AlertCircle, CheckCircle2, Pencil } from "lucide-react";
import { useT } from "@/lib/i18n/client";
import { addFileAction, removeInputAction, saveIdeaTextAction, submitIdeaAction, updateInputTextAction } from "@/app/actions/onboarding";
import { Button, Notice, Textarea, cx } from "@/components/ui";
import { StepHeading, type InputItem, type WizardProps } from "./OnboardingWizard";
import { VoiceRecorder } from "./VoiceRecorder";

const ACCEPT = "image/jpeg,image/png,image/webp,application/pdf,.pdf,.doc,.docx,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document";

export function IdeaStep({ session, inputs: initial, ai }: WizardProps) {
  const t = useT();
  const router = useRouter();
  const [text, setText] = useState(session.ideaText);
  const [inputs, setInputs] = useState<InputItem[]>(initial);
  const [uploading, setUploading] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [voiceOpen, setVoiceOpen] = useState(false);
  const [pending, start] = useTransition();
  const fileRef = useRef<HTMLInputElement>(null);
  const saved = useRef(session.ideaText);

  // Autosave the idea (debounced) so Save & Exit or a refresh never loses it.
  useEffect(() => {
    if (text === saved.current) return;
    const h = setTimeout(() => {
      saved.current = text;
      void saveIdeaTextAction(session.id, text);
    }, 700);
    return () => clearTimeout(h);
  }, [text, session.id]);

  const upload = async (files: FileList | File[]) => {
    setError(null);
    for (const f of Array.from(files)) {
      if (f.type.startsWith("video/")) {
        setError(t("wizard.videoNotSupported"));
        continue;
      }
      setUploading((n) => n + 1);
      const fd = new FormData();
      fd.set("file", f);
      const r = await addFileAction(session.id, fd);
      setUploading((n) => n - 1);
      if (r.ok) setInputs((xs) => [...xs, r.data]);
      else setError(t(r.error, r.params));
    }
  };

  const remove = async (id: string) => {
    setInputs((xs) => xs.filter((x) => x.id !== id));
    await removeInputAction(id);
  };

  const submit = () =>
    start(async () => {
      setError(null);
      await saveIdeaTextAction(session.id, text);
      const r = await submitIdeaAction(session.id, text);
      if (!r.ok) setError(t(r.error, r.params));
      else router.refresh();
    });

  const canContinue = text.trim().length > 0 || inputs.some((i) => i.status === "ready" || i.status === "processing");

  return (
    <div>
      <StepHeading eyebrow={ai.configured ? t("wizard.idea.eyebrow") : undefined} title={t("wizard.idea.title")} sub={t("wizard.idea.sub")} />

      <div
        className="glass rounded-[28px] p-2 transition focus-within:shadow-glow"
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          if (e.dataTransfer.files.length) void upload(e.dataTransfer.files);
        }}
      >
        <div className="rounded-[22px] bg-white">
          <label htmlFor="idea" className="sr-only">
            {t("wizard.idea.title")}
          </label>
          <Textarea
            id="idea"
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={t("wizard.idea.placeholder")}
            maxLength={4000}
            rows={5}
            className="min-h-40 resize-none border-0 bg-transparent px-5 pt-5 text-[17px] leading-relaxed focus:ring-0"
          />
          {inputs.length > 0 && (
            <ul className="flex flex-wrap gap-2 px-4 pb-3">
              {inputs.map((i) => (
                <InputChip key={i.id} item={i} onRemove={() => remove(i.id)} onEdited={(txt) => setInputs((xs) => xs.map((x) => (x.id === i.id ? { ...x, text: txt, status: "ready", error: null } : x)))} />
              ))}
              {uploading > 0 && (
                <li className="inline-flex h-10 items-center gap-2 rounded-xl bg-primary-soft px-3 text-sm font-semibold text-primary-strong">
                  <Loader2 className="size-4 animate-spin" /> {t("wizard.idea.uploading")}
                </li>
              )}
            </ul>
          )}
          <div className="flex items-center gap-1.5 border-t border-line/70 px-3 py-2.5">
            <input ref={fileRef} type="file" multiple accept={ACCEPT} className="hidden" onChange={(e) => e.target.files && upload(e.target.files)} />
            <button type="button" onClick={() => fileRef.current?.click()} className="group inline-flex h-10 items-center gap-2 rounded-pill px-3 text-sm font-semibold text-ink/80 hover:bg-primary-soft hover:text-primary-strong" aria-label={t("wizard.idea.attach")}>
              <Paperclip className="size-[18px]" /> <span className="hidden sm:inline">{t("wizard.idea.attach")}</span>
            </button>
            <button type="button" onClick={() => setVoiceOpen(true)} className="inline-flex h-10 items-center gap-2 rounded-pill px-3 text-sm font-semibold text-ink/80 hover:bg-primary-soft hover:text-primary-strong" aria-label={t("wizard.voice.record")}>
              <Mic className="size-[18px]" /> <span className="hidden sm:inline">{t("wizard.voice.record")}</span>
            </button>
            <span className="ml-auto hidden text-xs text-muted sm:inline">{t("wizard.idea.formats")}</span>
          </div>
        </div>
      </div>

      {voiceOpen && (
        <VoiceRecorder
          sessionId={session.id}
          sttAvailable={ai.stt}
          onClose={() => setVoiceOpen(false)}
          onSaved={(item) => {
            setInputs((xs) => [...xs, item]);
            setVoiceOpen(false);
          }}
        />
      )}

      <div className="mt-4 flex flex-wrap justify-center gap-2">
        {["s1", "s2", "s3"].map((k) => (
          <button key={k} type="button" onClick={() => setText(t(`wizard.idea.samples.${k}`))} className="rounded-pill bg-white/70 px-3.5 py-1.5 text-[13px] font-medium text-ink/75 ring-1 ring-line hover:text-primary-strong hover:ring-primary/30">
            {t(`wizard.idea.samples.${k}`)}
          </button>
        ))}
      </div>

      {error && (
        <Notice tone="danger" className="mt-5">
          {error}
        </Notice>
      )}
      {!ai.configured && (
        <Notice tone="blue" className="mt-5">
          {t("wizard.manualNotice")}
        </Notice>
      )}

      <div className="mt-8 flex flex-col items-center gap-3">
        <Button size="lg" onClick={submit} disabled={!canContinue || pending || uploading > 0} className="min-w-56">
          {pending ? <Loader2 className="size-5 animate-spin" /> : <Sparkles className="size-5" />} {t("common.continue")} <ArrowRight className="size-5" />
        </Button>
        <p className="text-xs text-muted">{t("wizard.idea.privacy")}</p>
      </div>
    </div>
  );
}

function InputChip({ item, onRemove, onEdited }: { item: InputItem; onRemove: () => void; onEdited: (text: string) => void }) {
  const t = useT();
  const [editing, setEditing] = useState(item.kind === "voice" && (item.status === "unsupported" || item.status === "failed"));
  const [draft, setDraft] = useState(item.text ?? "");
  const [saving, setSaving] = useState(false);
  const Icon = item.kind === "image" ? ImagePlus : item.kind === "voice" ? Mic : FileText;
  const ok = item.status === "ready";
  const bad = item.status === "failed" || item.status === "unsupported";

  if (item.kind === "voice") {
    return (
      <li className="w-full rounded-2xl bg-primary-soft/60 p-3 ring-1 ring-primary/15">
        <div className="flex items-center gap-2 text-sm font-semibold">
          <Mic className="size-4 text-primary" /> {t("wizard.voice.note")} {item.durationSec ? `· ${item.durationSec}s` : ""}
          {ok && !editing && <CheckCircle2 className="size-4 text-success" />}
          <span className="flex-1" />
          {!editing && ok && (
            <button type="button" onClick={() => setEditing(true)} className="inline-flex items-center gap-1 text-xs font-semibold text-primary-strong">
              <Pencil className="size-3.5" /> {t("common.edit")}
            </button>
          )}
          <button type="button" onClick={onRemove} className="rounded-full p-1 text-muted hover:bg-white" aria-label={t("common.remove")}>
            <X className="size-4" />
          </button>
        </div>
        {bad && <p className="mt-1 text-xs text-warning">{t(item.error ?? "wizard.sttFailed")}</p>}
        {editing ? (
          <div className="mt-2 flex flex-col gap-2">
            <Textarea value={draft} onChange={(e) => setDraft(e.target.value)} placeholder={t("wizard.voice.typePlaceholder")} rows={3} />
            <Button
              size="sm"
              className="self-end"
              disabled={!draft.trim() || saving}
              onClick={async () => {
                setSaving(true);
                const r = await updateInputTextAction(item.id, draft);
                setSaving(false);
                if (r.ok) {
                  onEdited(draft);
                  setEditing(false);
                }
              }}
            >
              {saving && <Loader2 className="size-4 animate-spin" />} {t("common.save")}
            </Button>
          </div>
        ) : (
          item.text && <p className="mt-1.5 text-sm text-ink/80">“{item.text}”</p>
        )}
      </li>
    );
  }

  return (
    <li className={cx("inline-flex h-10 max-w-full items-center gap-2 rounded-xl px-2 text-sm ring-1", bad ? "bg-danger-soft ring-danger/20" : "bg-canvas ring-line")} title={bad ? t(item.error ?? "wizard.sttFailed") : undefined}>
      {item.assetId ? <img src={`/api/assets/${item.assetId}`} alt="" className="size-7 rounded-lg object-cover" /> : <Icon className="size-4 text-primary" />}
      <span className="max-w-40 truncate font-medium">{item.name}</span>
      {item.status === "processing" && <Loader2 className="size-3.5 animate-spin text-muted" aria-label={t("wizard.idea.reading")} />}
      {ok && item.kind === "document" && <CheckCircle2 className="size-3.5 text-success" aria-label={t("wizard.idea.read")} />}
      {bad && <AlertCircle className="size-3.5 text-danger" />}
      <button type="button" onClick={onRemove} className="rounded-full p-0.5 text-muted hover:bg-white" aria-label={t("common.remove")}>
        <X className="size-3.5" />
      </button>
    </li>
  );
}
