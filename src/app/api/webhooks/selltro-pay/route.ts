import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { orders } from "@/lib/db/schema";
import { BillplzGateway } from "@/lib/payments/billplz";
import { handleVerified } from "@/lib/payments/webhook";
import { platformBillplzSecrets, selltroEnvironment } from "@/lib/finance/selltro-pay";
import { raiseAlert } from "@/lib/admin/alerts";
import { log } from "@/lib/log";

/**
 * Selltro Pay (Billplz) bill callback. One platform collection, so the bill id — not the URL —
 * identifies the order. The X-Signature is verified with the platform key before anything is read.
 */
export async function POST(req: Request) {
  const env = selltroEnvironment();
  if (env !== "sandbox" && env !== "live") return new Response("Not enabled", { status: 404 });
  const data = Object.fromEntries(new URLSearchParams(await req.text()).entries());
  let ev;
  try {
    ev = { ...BillplzGateway.verifyCallback(data, platformBillplzSecrets()), provider: "selltro_pay" as const };
  } catch (e) {
    log("warn", "selltro.webhook.invalid_signature", { error: String(e) });
    await raiseAlert(await getDb(), { kind: "payment.callback_invalid", severity: "warning", message: "Selltro Pay callback with an invalid X-Signature was rejected.", dedupeKey: "selltro:invalid_signature", link: "/admin/health" });
    return new Response("Invalid signature", { status: 400 });
  }
  const db = await getDb();
  const order = ev.providerRef ? await db.query.orders.findFirst({ where: eq(orders.providerRef, ev.providerRef) }) : null;
  if (!order || order.provider !== "selltro_pay") {
    await raiseAlert(db, { kind: "payment.callback_unmatched", severity: "critical", message: `Verified Selltro Pay callback for unknown bill ${ev.providerRef}.`, dedupeKey: `selltro:unmatched:${ev.providerRef}`, link: "/admin/payments" });
    return new Response(JSON.stringify({ received: true, status: "unmatched" }), { status: 200 });
  }
  return handleVerified(order.workspaceId, ev);
}
