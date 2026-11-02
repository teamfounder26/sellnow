import { getDb } from "@/lib/db";
import { verifyParcelDailyWebhook } from "@/lib/couriers/parceldaily";
import { handleParcelDailyEvent } from "@/lib/couriers/service";
import { raiseAlert } from "@/lib/admin/alerts";
import { log } from "@/lib/log";

/** ParcelDaily checkout / tracking / COD webhooks. Signature over the RAW body is required. */
export async function POST(req: Request) {
  const raw = await req.text();
  if (!verifyParcelDailyWebhook(raw, req.headers.get("x-webhook-timestamp"), req.headers.get("x-webhook-signature"))) {
    log("warn", "courier.webhook.invalid_signature", { provider: "parceldaily" });
    await raiseAlert(await getDb(), { kind: "courier.webhook_invalid", severity: "warning", message: "ParcelDaily webhook rejected (missing/invalid signature or PARCELDAILY_WEBHOOK_SECRET not set).", dedupeKey: "parceldaily:webhook_invalid", link: "/admin/health" });
    return new Response("Invalid signature", { status: 401 });
  }
  try {
    const result = await handleParcelDailyEvent(await getDb(), raw);
    return Response.json({ received: true, result });
  } catch (e) {
    log("error", "courier.webhook.failed", { error: String(e) });
    return new Response("Error", { status: 500 }); // ParcelDaily retries (3×, 90 s apart)
  }
}
