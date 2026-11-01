import Link from "next/link";
import { notFound } from "next/navigation";
import { requireWorkspace } from "@/lib/auth/session";
import { getT } from "@/lib/i18n/server";
import { getCustomerTimeline } from "@/lib/crm/service";
import { formatMYR } from "@/lib/money";
import { Badge, Card } from "@/components/ui";
import { OptOutToggle } from "@/components/crm/OptOutToggle";
import { AppError } from "@/lib/errors";

export default async function CustomerDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { db, workspace, role } = await requireWorkspace("viewer");
  const { t, locale } = await getT();
  const data = await getCustomerTimeline(db, workspace.id, id).catch((e) => {
    if (e instanceof AppError) notFound();
    throw e;
  });
  const { customer: c, events } = data;
  const fmt = new Intl.DateTimeFormat(locale === "ms" ? "ms-MY" : "en-MY", { dateStyle: "medium", timeStyle: "short", timeZone: workspace.timezone });
  return (
    <div className="space-y-6">
      <Link href="/dashboard/customers" className="text-sm font-semibold text-muted hover:text-ink">← {t("customers.title")}</Link>
      <div className="grid gap-6 lg:grid-cols-[320px_minmax(0,1fr)]">
        <Card className="h-fit space-y-2 p-5 text-sm">
          <p className="text-xl font-extrabold">{c.name}</p>
          <p className="text-muted">{c.email}</p>
          {c.phone && <p className="text-muted">{c.phone}</p>}
          <p>{t("customers.source")}: <b>{c.source}</b></p>
          <p className="flex items-center gap-2">
            {t("customers.consent")}: {c.optedOutAt ? <Badge tone="danger">{t("customers.optedOut")}</Badge> : c.marketingConsent ? <Badge tone="success">✓</Badge> : <Badge>—</Badge>}
          </p>
          {role !== "viewer" && <OptOutToggle customerId={c.id} optedOut={Boolean(c.optedOutAt)} />}
        </Card>
        <Card className="p-5">
          <p className="font-bold">{t("customers.timeline")}</p>
          <ol className="mt-4 space-y-3 border-l-2 border-line pl-4">
            {events.map((e, i) => (
              <li key={i} className="relative text-sm">
                <span className="absolute -left-[23px] top-1.5 size-3 rounded-full border-2 border-surface bg-primary" />
                <time className="text-xs text-muted">{fmt.format(e.at)}</time>
                {e.kind === "order" ? (
                  <p>
                    <Link href={`/dashboard/orders/${e.order.id}`} className="font-semibold underline-offset-4 hover:underline">
                      {t("customers.orderEvent", { n: e.order.number, status: t(`orders.status.${e.order.paymentStatus}`) })}
                    </Link>{" "}
                    · {formatMYR(e.order.totalSen, locale)} {e.order.isTest && <Badge tone="warning">{t("orders.testBadge")}</Badge>}
                  </p>
                ) : (
                  <p>{t("customers.leadEvent", { message: e.lead.message || "—" })} <Badge tone="ai">{t(`customers.leadStatus.${e.lead.status}`)}</Badge></p>
                )}
              </li>
            ))}
          </ol>
        </Card>
      </div>
    </div>
  );
}
