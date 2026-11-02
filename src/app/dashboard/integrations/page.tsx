import { CreditCard, Share2, Music2, MessageCircle, Globe2, Sparkles, Mic } from "lucide-react";
import { requireWorkspace } from "@/lib/auth/session";
import { getT } from "@/lib/i18n/server";
import { getPaymentIntegration } from "@/lib/payments/integrations";
import { metaStatus } from "@/lib/marketing/service";
import { configuredProviderName } from "@/lib/ai/provider";
import { transcriptionConfigured } from "@/lib/ai/transcribe";
import { Badge, Card, GlassIcon, LinkButton } from "@/components/ui";
import { CourierCards } from "@/components/commerce/CourierCards";
import { courierCatalog } from "@/lib/couriers/service";
import { getSellerAccount } from "@/lib/finance/selltro-pay";

export const metadata = { title: "Integrations" };

/** Real connection status for every integration; unbuilt ones say so instead of pretending. */
export default async function IntegrationsPage() {
  const { db, workspace, role } = await requireWorkspace("viewer");
  const { t } = await getT();
  const [legacy, meta, selltro, couriers] = await Promise.all([getPaymentIntegration(db, workspace.id), metaStatus(db, workspace.id), getSellerAccount(db, workspace.id), courierCatalog(db, workspace.id)]);
  const payment = selltro?.status === "ACTIVE" ? { provider: "Selltro Pay" } : legacy;
  const ai = configuredProviderName();
  const items = [
    { k: "payment", icon: CreditCard, status: payment ? "connected" : "notConnected", detail: payment?.provider, href: "/dashboard/settings?tab=payments" },
    { k: "ai", icon: Sparkles, status: ai ? "connected" : "notConfigured", detail: ai ?? undefined, href: "/dashboard/settings?tab=ai" },
    { k: "voice", icon: Mic, status: transcriptionConfigured() ? "connected" : "notConfigured" },
    { k: "meta", icon: Share2, status: meta.connected ? "connected" : meta.appConfigured ? "notConnected" : "comingSoon", href: "/dashboard/marketing" },
    { k: "tiktok", icon: Music2, status: "comingSoon" },
    { k: "whatsapp", icon: MessageCircle, status: "comingSoon" },
    { k: "domain", icon: Globe2, status: "comingSoon" },
  ] as const;
  const tone = { connected: "success", notConnected: "warning", notConfigured: "warning", comingSoon: "neutral" } as const;
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-extrabold tracking-tight">{t("integrations.title")}</h1>
        <p className="mt-1 text-muted">{t("integrations.sub")}</p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {items.map((i) => (
          <Card key={i.k} className="flex flex-col p-5">
            <div className="flex items-start justify-between">
              <GlassIcon size="lg">
                <i.icon />
              </GlassIcon>
              <Badge tone={tone[i.status]}>{t(`integrations.status.${i.status}`)}</Badge>
            </div>
            <p className="mt-4 font-bold">{t(`integrations.items.${i.k}.name`)}</p>
            <p className="mt-1 flex-1 text-sm text-muted">{t(`integrations.items.${i.k}.desc`)}</p>
            {"detail" in i && i.detail && <p className="mt-2 text-xs font-semibold text-primary-strong">{i.detail}</p>}
            {"href" in i && i.href && (
              <LinkButton href={i.href} variant="secondary" size="sm" className="mt-4">
                {t("integrations.manage")}
              </LinkButton>
            )}
          </Card>
        ))}
      </div>
      <div id="couriers" className="scroll-mt-24">
        <CourierCards items={couriers} canEdit={role === "owner" || role === "admin"} />
      </div>
    </div>
  );
}
