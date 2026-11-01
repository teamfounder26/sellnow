"use client";
import { useRef, useState } from "react";
import { ArrowUp, ImagePlus, Paperclip, X, Loader2 } from "lucide-react";
import clsx from "clsx";
import { useT } from "@/lib/i18n/client";

export type ComposerSubmit = { text: string; file: File | null };

/**
 * The large AI prompt composer used on the landing page, onboarding and dashboard.
 * Keeps the user's text and attachment on failure (the parent decides when to clear).
 */
export function AIComposer({
  placeholder,
  onSubmit,
  busy,
  allowFiles = true,
  size = "lg",
  defaultValue = "",
  value,
  onChange,
  autoFocus,
  submitLabel,
}: {
  placeholder: string;
  onSubmit: (v: ComposerSubmit) => void | Promise<void>;
  busy?: boolean;
  allowFiles?: boolean;
  size?: "md" | "lg";
  defaultValue?: string;
  value?: string;
  onChange?: (v: string) => void;
  autoFocus?: boolean;
  submitLabel?: string;
}) {
  const t = useT();
  const [inner, setInner] = useState(defaultValue);
  const text = value ?? inner;
  const setText = (v: string) => (onChange ? onChange(v) : setInner(v));
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const imgRef = useRef<HTMLInputElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const pick = (f: File | undefined | null) => {
    if (!f) return;
    setFile(f);
    setPreview(f.type.startsWith("image/") ? URL.createObjectURL(f) : null);
  };
  const clear = () => {
    setFile(null);
    setPreview(null);
  };
  const submit = async () => {
    if (busy || (!text.trim() && !file)) return;
    await onSubmit({ text: text.trim(), file });
  };

  return (
    <div className={clsx("group relative rounded-[28px] bg-surface p-2 shadow-lift ring-1 ring-line transition focus-within:ring-2 focus-within:ring-ai/60", busy && "ai-glow")}>
      {busy && <div className="pointer-events-none absolute -inset-px rounded-[28px] ring-2 ring-ai/40 animate-pulse-soft" aria-hidden />}
      {file && (
        <div className="mx-2 mt-2 flex items-center gap-3 rounded-2xl bg-cream p-2 pr-3 text-sm">
          {preview ? <img src={preview} alt="" className="size-12 rounded-xl object-cover" /> : <Paperclip className="size-5 text-muted" />}
          <span className="min-w-0 flex-1 truncate font-medium">{file.name}</span>
          <button type="button" onClick={clear} className="rounded-full p-1 text-muted hover:bg-ink/5 hover:text-ink" aria-label={t("common.remove")}>
            <X className="size-4" />
          </button>
        </div>
      )}
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
            e.preventDefault();
            void submit();
          }
        }}
        placeholder={placeholder}
        rows={size === "lg" ? 3 : 2}
        autoFocus={autoFocus}
        maxLength={4000}
        aria-label={placeholder}
        className={clsx("block w-full resize-none bg-transparent px-4 pt-3 text-ink placeholder:text-muted/70 focus:outline-none", size === "lg" ? "text-[17px] sm:text-lg" : "text-[15px]")}
      />
      <div className="flex items-center justify-between gap-2 px-2 pb-1">
        <div className="flex items-center gap-1">
          {allowFiles && (
            <>
              <input ref={imgRef} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={(e) => pick(e.target.files?.[0])} />
              <input ref={fileRef} type="file" accept="image/*,application/pdf" className="hidden" onChange={(e) => pick(e.target.files?.[0])} />
              <button type="button" onClick={() => imgRef.current?.click()} className="inline-flex h-9 items-center gap-1.5 rounded-pill px-3 text-sm font-medium text-muted hover:bg-ink/5 hover:text-ink">
                <ImagePlus className="size-4" />
                <span className="hidden sm:inline">{t("landing.uploadImage")}</span>
              </button>
              <button type="button" onClick={() => fileRef.current?.click()} className="inline-flex h-9 items-center gap-1.5 rounded-pill px-3 text-sm font-medium text-muted hover:bg-ink/5 hover:text-ink">
                <Paperclip className="size-4" />
                <span className="hidden sm:inline">{t("landing.attachFile")}</span>
              </button>
            </>
          )}
        </div>
        <button
          type="button"
          onClick={() => void submit()}
          disabled={busy || (!text.trim() && !file)}
          className="inline-flex h-11 items-center gap-2 rounded-pill bg-ink pl-4 pr-3 text-sm font-semibold text-white transition hover:bg-ink/85 disabled:opacity-40"
        >
          {submitLabel ?? t("landing.submit")}
          <span className="grid size-7 place-items-center rounded-full bg-primary text-white">{busy ? <Loader2 className="size-4 animate-spin" /> : <ArrowUp className="size-4" />}</span>
        </button>
      </div>
    </div>
  );
}

export function PromptSuggestionChip({ children, onClick, icon }: { children: React.ReactNode; onClick?: () => void; icon?: React.ReactNode }) {
  return (
    <button type="button" onClick={onClick} className="inline-flex items-center gap-2 rounded-pill border border-line bg-surface px-4 py-2 text-sm font-semibold text-ink shadow-soft transition hover:-translate-y-0.5 hover:border-ink/25">
      {icon}
      {children}
    </button>
  );
}
