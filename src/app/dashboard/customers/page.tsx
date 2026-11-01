import Link from "next/link";
import { Users, Inbox } from "lucide-react";
import { requireWorkspace } from "@/lib/auth/session";
import { getT } from "@/lib/i18n/server";
import { listCustomers, listLeads } from "@/lib/crm/service";
import { formatMYR } from "@/lib/money";
import { Badge, Card, EmptyState, Notice, SectionHeader } from "@/components/ui";
import { LeadRow } from "@/components/crm/LeadRow";

export default async function CustomersPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const { tab } = await searchParams;
  const { db, workspace, role } = await requireWorkspace("viewer");
  const { t, locale } = await getT();
  const leadsTab = tab === "leads";
  const fmt = new Intl.DateTimeFormat(locale === "ms" ? "ms-MY" : "en-MY", { dateStyle: "medium", timeZone: workspace.timezone });
  return (
    <>
      <SectionHeader title={t("customers.title")} sub={t("customers.sub")} />
      <div className="mb-4 flex gap-2">
        <Link href="/dashboard/customers" className={`rounded-pill px-4 py-1.5 text-sm font-semibold ${!leadsTab ? "bg-ink text-white" : "border border-line bg-surface text-muted"}`}>{t("customers.tabCustomers")}</Link>
        <Link href="/dashboard/customers?tab=leads" className={`rounded-pill px-4 py-1.5 text-sm font-semibold ${leadsTab ? "bg-ink text-white" : "border border-line bg-surface text-muted"}`}>{t("customers.tabLeads")}</Link>
      </div>
      {leadsTab ? (
        await (async () => {
          const leads = await listLeads(db, workspace.id);
          if (!leads.length) return <EmptyState icon={<Inbox className="size-6" />} title={t("customers.emptyLeads")} body={t("customers.emptyBody")} />;
          return (
            <div className="space-y-4">
              <Notice tone="ai">{t("customers.salesAssistantNote")}</Notice>
              <div className="space-y-3">
                {leads.map(({ lead, customer }) => (
                  <LeadRow key={lead.id} lead={{ id: lead.id, status: lead.status, message: lead.message, humanTakeover: lead.humanTakeover, createdAt: fmt.format(lead.createdAt) }} customer={customer} canEdit={role !== "viewer"} />
                ))}
              </div>
            </div>
          );
        })()
      ) : (
        await (async () => {
          const rows = await listCustomers(db, workspace.id);
          if (!rows.length) return <EmptyState icon={<Users className="size-6" />} title={t("customers.empty")} body={t("customers.emptyBody")} />;
          return (
            <Card className="overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[640px] text-sm">
                  <thead className="bg-cream text-left text-xs font-semibold uppercase tracking-wider text-muted">
                    <tr>
                      <th className="px-4 py-3">{t("customers.name")}</th>
                      <th className="px-4 py-3">{t("customers.source")}</th>
                      <th className="px-4 py-3">{t("customers.orders")}</th>
                      <th className="px-4 py-3">{t("customers.spent")}</th>
                      <th className="px-4 py-3">{t("customers.consent")}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {rows.map(({ customer: c, orders, spentSen }) => (
                      <tr key={c.id} className="hover:bg-cream/60">
                        <td className="px-4 py-3">
                          <Link href={`/dashboard/customers/${c.id}`} className="font-semibold underline-offset-4 hover:underline">{c.name}</Link>
                          <p className="text-xs text-muted">{c.email}</p>
                        </td>
                        <td className="px-4 py-3 text-muted">{c.source}</td>
                        <td className="px-4 py-3">{orders}</td>
                        <td className="px-4 py-3 font-semibold">{formatMYR(spentSen, locale)}</td>
                        <td className="px-4 py-3">{c.optedOutAt ? <Badge tone="danger">{t("customers.optedOut")}</Badge> : c.marketingConsent ? <Badge tone="success">✓</Badge> : <Badge>—</Badge>}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          );
        })()
      )}
    </>
  );
}
