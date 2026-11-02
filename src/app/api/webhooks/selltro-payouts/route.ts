import { getDb } from "@/lib/db";
import { payoutWebhookEvents } from "@/lib/db/schema";
import { verifyPayoutCallback } from "@/lib/finance/payment-orders";
import { applyPayoutStatus } from "@/lib/finance/settlement";
import { raiseAlert } from "@/lib/admin/alerts";
import { newId } from "@/lib/ids";

/** Billplz Payment Order callback (checksum verified; deduplicated; must answer 200 within 20 s). */
export async function POST(req: Request) {
  const params = Object.fromEntries(new URLSearchParams(await req.text()).entries());
  const db = await getDb();
  let cb;
  try {
    cb = verifyPayoutCallback(params);
  } catch {
    await raiseAlert(db, { kind: "settlement.callback_invalid", severity: "critical", message: "Payment Order callback with an invalid checksum was rejected.", dedupeKey: "payout:invalid_checksum", link: "/admin/health" });
    return new Response("Invalid checksum", { status: 400 });
  }
  const ins = await db.insert(payoutWebhookEvents).values({ id: newId("pwe"), provider: "billplz_payment_order", providerEventId: `${cb.id}:${cb.status}:${params.epoch}`, payload: params }).onConflictDoNothing().returning({ id: payoutWebhookEvents.id });
  if (!ins.length) return Response.json({ received: true, duplicate: true });
  const result = await applyPayoutStatus(db, cb.id, cb.status);
  if (result === "unmatched") await raiseAlert(db, { kind: "settlement.callback_unmatched", severity: "critical", message: `Payment Order callback for unknown id ${cb.id}.`, dedupeKey: `payout:unmatched:${cb.id}`, link: "/admin/settlements" });
  return Response.json({ received: true, result });
}
