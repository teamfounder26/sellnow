import { eq } from "drizzle-orm";
import { FlaskConical } from "lucide-react";
import { getDb } from "@/lib/db";
import { orders, storefronts } from "@/lib/db/schema";
import { TestGateway } from "@/lib/payments/test-gateway";
import { testGatewayAllowed } from "@/lib/payments/integrations";
import { safeEqualHex } from "@/lib/crypto";
import { orderViewToken } from "@/lib/commerce/checkout";
import { getT } from "@/lib/i18n/server";
import { formatMYR } from "@/lib/money";
import { TestPayButtons } from "@/components/TestPayButtons";

export const metadata = { title: "Test Gateway", robots: { index: false } };

export default async function TestPayPage({ params, searchParams }: { params: Promise<{ orderId: string }>; searchParams: Promise<{ k?: string }> }) {
  const { orderId } = await params;
  const { k } = await searchParams;
  const { t, locale } = await getT();
  if (!testGatewayAllowed()) return <p className="p-10 text-center">{t("testpay.disabled")}</p>;
  const db = await getDb();
  const order = k && safeEqualHex(k, TestGateway.pageToken(orderId)) ? await db.query.orders.findFirst({ where: eq(orders.id, orderId) }) : null;
  if (!order || order.provider !== "test") return <p className="p-10 text-center">{t("order.invalidLink")}</p>;
  const sf = await db.query.storefronts.findFirst({ where: eq(storefronts.workspaceId, order.workspaceId) });
  const back = `/s/${sf?.slug}/order/${order.id}?k=${orderViewToken(order.id)}`;
  return (
    <div className="flex min-h-dvh items-center justify-center bg-[repeating-linear-gradient(45deg,#fff1be,#fff1be_14px,#fffbf5_14px,#fffbf5_28px)] px-4">
      <div className="w-full max-w-md rounded-[28px] border-2 border-dashed border-warning bg-surface p-7 shadow-lift">
        <p className="flex items-center gap-2 text-sm font-extrabold uppercase tracking-wider text-warning">
          <FlaskConical className="size-5" /> {t("testpay.title")}
        </p>
        <p className="mt-3 text-[15px] text-muted">{t("testpay.body")}</p>
        <p className="mt-6 text-sm text-muted">{t("order.number", { n: order.number })}</p>
        <p className="text-4xl font-extrabold">{formatMYR(order.totalSen, locale)}</p>
        <TestPayButtons orderId={order.id} token={k!} back={back} />
      </div>
    </div>
  );
}
