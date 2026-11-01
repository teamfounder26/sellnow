"use client";
import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Card, Select } from "@/components/ui";
import { useT } from "@/lib/i18n/client";
import { updateLeadAction } from "@/app/actions/orders";

type Status = "new" | "contacted" | "qualified" | "won" | "lost";

export function LeadRow({ lead, customer, canEdit }: { lead: { id: string; status: Status; message: string; humanTakeover: boolean; createdAt: string }; customer: { id: string; name: string; email: string; phone: string | null }; canEdit: boolean }) {
  const t = useT();
  const router = useRouter();
  const [pending, start] = useTransition();
  const patch = (p: { status?: Status; humanTakeover?: boolean }) =>
    start(async () => {
      await updateLeadAction(lead.id, p);
      router.refresh();
    });
  return (
    <Card className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
      <div className="min-w-0 flex-1">
        <p className="font-bold">{customer.name} <span className="text-sm font-normal text-muted">· {lead.createdAt}</span></p>
        <p className="text-sm text-muted">{customer.email}{customer.phone ? ` · ${customer.phone}` : ""}</p>
        {lead.message && <p className="mt-2 text-[15px]">{lead.message}</p>}
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-2 text-xs font-semibold" title={t("customers.humanTakeoverHelp")}>
          <input type="checkbox" className="size-4 accent-ink" checked={lead.humanTakeover} disabled={!canEdit || pending} onChange={(e) => patch({ humanTakeover: e.target.checked })} />
          {t("customers.humanTakeover")}
        </label>
        <Select className="h-9 w-40 text-sm" value={lead.status} disabled={!canEdit || pending} onChange={(e) => patch({ status: e.target.value as Status })}>
          {(["new", "contacted", "qualified", "won", "lost"] as Status[]).map((s) => (
            <option key={s} value={s}>{t(`customers.leadStatus.${s}`)}</option>
          ))}
        </Select>
      </div>
    </Card>
  );
}
