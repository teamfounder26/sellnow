import clsx from "clsx";
import type { ReactNode } from "react";

export function KPIStatCard({ label, value, hint, icon, tone = "bg-primary-soft", missing }: { label: string; value: ReactNode; hint?: ReactNode; icon?: ReactNode; tone?: string; missing?: string }) {
  return (
    <div className="rounded-card border border-line bg-surface p-5 shadow-soft">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold text-muted">{label}</p>
        {icon && <span className={clsx("grid size-8 place-items-center rounded-xl", tone)}>{icon}</span>}
      </div>
      {missing ? <p className="mt-3 text-sm text-muted">{missing}</p> : <p className="mt-3 text-2xl font-extrabold tracking-tight sm:text-[28px]">{value}</p>}
      {hint && !missing && <p className="mt-1 text-xs text-muted">{hint}</p>}
    </div>
  );
}
