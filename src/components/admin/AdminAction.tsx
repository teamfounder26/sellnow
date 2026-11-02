"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { useT } from "@/lib/i18n/client";
import { cx } from "@/components/ui";

type Result = { ok: true; data?: unknown } | { ok: false; error: string; params?: Record<string, string | number> };

/**
 * One admin operation. Asks for a reason and/or the admin's password when the action needs them
 * (re-authentication for money and access changes), then calls the bound server action.
 */
export function AdminAction({ label, action, needsText, textLabel = "Reason", needsPassword, tone = "primary", confirm }: { label: string; action: (...args: string[]) => Promise<Result>; needsText?: boolean; textLabel?: string; needsPassword?: boolean; tone?: "primary" | "danger" | "ghost"; confirm?: string }) {
  const t = useT();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [pw, setPw] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  const cls = cx("inline-flex h-8 items-center gap-1.5 rounded-pill px-3 text-xs font-bold transition disabled:opacity-50", tone === "primary" && "bg-primary text-white", tone === "danger" && "bg-danger text-white", tone === "ghost" && "bg-white ring-1 ring-line");
  const go = () =>
    start(async () => {
      const args = [...(needsText ? [text] : []), ...(needsPassword ? [pw] : [])];
      const r = await action(...args);
      setMsg(r.ok ? { ok: true, text: "Done" } : { ok: false, text: t(r.error, r.params) });
      if (r.ok) {
        setOpen(false);
        setPw("");
        setText("");
        router.refresh();
      }
    });
  if (!needsText && !needsPassword)
    return (
      <span className="inline-flex flex-col gap-1">
        <button type="button" className={cls} disabled={pending} onClick={() => (!confirm || window.confirm(confirm)) && go()}>{pending && <Loader2 className="size-3 animate-spin" />}{label}</button>
        {msg && !msg.ok && <span className="text-[11px] text-danger">{msg.text}</span>}
      </span>
    );
  return (
    <span className="inline-flex flex-col gap-1">
      {!open ? (
        <button type="button" className={cls} onClick={() => setOpen(true)}>{label}</button>
      ) : (
        <span className="flex flex-wrap items-center gap-1.5 rounded-xl bg-canvas p-2">
          {needsText && <input aria-label={textLabel} placeholder={textLabel} value={text} onChange={(e) => setText(e.target.value)} className="h-8 w-48 rounded-lg border border-line bg-white px-2 text-xs" />}
          {needsPassword && <input aria-label="Your password" type="password" autoComplete="current-password" placeholder="Your password" value={pw} onChange={(e) => setPw(e.target.value)} className="h-8 w-36 rounded-lg border border-line bg-white px-2 text-xs" />}
          <button type="button" className={cls} disabled={pending || (needsPassword && !pw) || (needsText && text.trim().length < 3)} onClick={go}>{pending && <Loader2 className="size-3 animate-spin" />}{label}</button>
          <button type="button" className="text-xs text-muted" onClick={() => setOpen(false)}>Cancel</button>
        </span>
      )}
      {msg && <span className={cx("text-[11px]", msg.ok ? "text-success" : "text-danger")}>{msg.text}</span>}
    </span>
  );
}
