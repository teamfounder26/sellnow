"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useT } from "@/lib/i18n/client";
import { setAdminRoleAction } from "@/app/actions/admin";
import type { AdminRole } from "@/lib/db/schema";

/** Assign or remove a platform role (owner only; password re-check; last owner protected). */
export function AdminRoleForm({ roles }: { roles: AdminRole[] }) {
  const t = useT();
  const router = useRouter();
  const [f, setF] = useState({ email: "", role: "support" as AdminRole | "remove", pw: "" });
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <span className="flex flex-wrap items-center gap-1.5 text-xs">
      <input placeholder="user@email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} className="h-8 w-44 rounded-lg border border-line bg-white px-2" />
      <select value={f.role} onChange={(e) => setF({ ...f, role: e.target.value as AdminRole })} className="h-8 rounded-lg border border-line bg-white px-2">{roles.map((r) => <option key={r}>{r}</option>)}<option value="remove">remove access</option></select>
      <input type="password" placeholder="Your password" value={f.pw} onChange={(e) => setF({ ...f, pw: e.target.value })} className="h-8 w-32 rounded-lg border border-line bg-white px-2" />
      <button disabled={pending || !f.email || !f.pw} className="h-8 rounded-pill bg-primary px-3 font-bold text-white disabled:opacity-50" onClick={() => start(async () => { const r = await setAdminRoleAction(f.email, f.role, f.pw); setMsg(r.ok ? "Saved" : t(r.error)); setF({ ...f, pw: "" }); router.refresh(); })}>Assign</button>
      {msg && <span>{msg}</span>}
    </span>
  );
}
