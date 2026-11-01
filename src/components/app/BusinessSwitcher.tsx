"use client";
import { useTransition } from "react";
import { ChevronsUpDown, Plus, Check } from "lucide-react";
import { switchWorkspaceAction, createWorkspaceAction } from "@/app/actions/workspace";
import { useT } from "@/lib/i18n/client";

export function BusinessSwitcher({ current, options }: { current: { id: string; name: string }; options: { id: string; name: string; role: string }[] }) {
  const t = useT();
  const [pending, start] = useTransition();
  return (
    <details className="group relative">
      <summary className="flex min-w-0 max-w-[40vw] sm:max-w-[220px] cursor-pointer list-none items-center gap-2 rounded-pill border border-line bg-surface py-1.5 pl-1.5 pr-3 text-sm font-semibold shadow-soft">
        <span className="grid size-7 shrink-0 place-items-center rounded-full bg-primary-soft text-xs font-extrabold">{current.name.slice(0, 1).toUpperCase()}</span>
        <span className="truncate">{current.name}</span>
        <ChevronsUpDown className="size-4 shrink-0 text-muted" />
      </summary>
      <div className="absolute left-0 top-12 z-40 w-64 rounded-2xl border border-line bg-surface p-2 shadow-lift">
        <p className="px-2 pb-1 pt-1 text-xs font-semibold text-muted">{t("nav.workspace")}</p>
        {options.map((o) => (
          <button
            key={o.id}
            type="button"
            disabled={pending}
            onClick={() => start(() => switchWorkspaceAction(o.id))}
            className="flex w-full items-center gap-2 rounded-xl px-2 py-2 text-left text-sm hover:bg-cream"
          >
            <span className="grid size-7 place-items-center rounded-full bg-cream text-xs font-bold">{o.name.slice(0, 1).toUpperCase()}</span>
            <span className="flex-1 truncate font-medium">{o.name}</span>
            {o.id === current.id && <Check className="size-4 text-success" />}
          </button>
        ))}
        <button type="button" disabled={pending} onClick={() => start(async () => void (await createWorkspaceAction()))} className="mt-1 flex w-full items-center gap-2 rounded-xl px-2 py-2 text-sm font-semibold text-ai-strong hover:bg-lavender">
          <Plus className="size-4" /> {t("nav.newWorkspace")}
        </button>
      </div>
    </details>
  );
}
