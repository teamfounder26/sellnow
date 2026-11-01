"use client";
import { useRef, useState } from "react";
import { Upload, Loader2, FileCheck2, X } from "lucide-react";
import { useT } from "@/lib/i18n/client";

export function FileUploader({ kind, accept, value, label, onChange }: { kind: "image" | "digital_file"; accept: string; value: string | null; label?: string | null; onChange: (id: string | null, name?: string) => void }) {
  const t = useT();
  const ref = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState<string | null>(label ?? null);

  const upload = async (f: File) => {
    setBusy(true);
    setError(null);
    const fd = new FormData();
    fd.set("file", f);
    fd.set("kind", kind);
    try {
      const r = (await fetch("/api/upload", { method: "POST", body: fd }).then((r) => r.json())) as { ok: boolean; id?: string; error?: string };
      if (r.ok && r.id) {
        setName(f.name);
        onChange(r.id, f.name);
      } else setError(r.error ?? "errors.unexpected");
    } catch {
      setError("errors.unexpected");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <input ref={ref} type="file" accept={accept} className="hidden" onChange={(e) => e.target.files?.[0] && void upload(e.target.files[0])} />
      {value && kind === "image" ? (
        <div className="relative inline-block">
          <img src={`/api/assets/${value}`} alt="" className="size-28 rounded-2xl border border-line object-cover" />
          <button type="button" onClick={() => onChange(null)} className="absolute -right-2 -top-2 grid size-7 place-items-center rounded-full bg-ink text-white" aria-label={t("common.remove")}>
            <X className="size-3.5" />
          </button>
        </div>
      ) : value ? (
        <div className="flex items-center gap-2 rounded-xl border border-line bg-cream px-3 py-2.5 text-sm">
          <FileCheck2 className="size-4 text-success" />
          <span className="flex-1 truncate font-medium">{name ?? value}</span>
          <button type="button" onClick={() => onChange(null)} className="text-muted hover:text-ink" aria-label={t("common.remove")}>
            <X className="size-4" />
          </button>
        </div>
      ) : (
        <button type="button" onClick={() => ref.current?.click()} disabled={busy} className="flex w-full items-center justify-center gap-2 rounded-2xl border border-dashed border-line bg-cream/60 px-4 py-6 text-sm font-semibold text-muted hover:border-ink/30 hover:text-ink">
          {busy ? <Loader2 className="size-4 animate-spin" /> : <Upload className="size-4" />}
          {busy ? t("upload.uploading") : t("upload.dropHere")}
        </button>
      )}
      {error && <p className="mt-1.5 text-sm text-danger">{t(error, { mb: kind === "image" ? 5 : 50 })}</p>}
    </div>
  );
}
