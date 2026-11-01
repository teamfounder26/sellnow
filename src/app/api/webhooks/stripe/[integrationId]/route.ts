import { loadIntegration, handleVerified } from "@/lib/payments/webhook";
import { readSecrets } from "@/lib/payments/integrations";
import { StripeGateway } from "@/lib/payments/stripe";
import type { StripeSecrets } from "@/lib/payments/types";
import { log } from "@/lib/log";

export async function POST(req: Request, { params }: { params: Promise<{ integrationId: string }> }) {
  const { integrationId } = await params;
  const found = await loadIntegration(integrationId, "stripe");
  if (!found) return new Response("Unknown integration", { status: 404 });
  const raw = await req.text(); // raw body is required for signature verification
  const sig = req.headers.get("stripe-signature");
  if (!sig) return new Response("Missing signature", { status: 400 });
  try {
    const ev = StripeGateway.verifyWebhook(raw, sig, readSecrets<StripeSecrets>(found.row));
    return handleVerified(found.row.workspaceId, ev);
  } catch (e) {
    log("warn", "payment.webhook.invalid_signature", { provider: "stripe", integrationId, error: String(e) });
    return new Response("Invalid signature", { status: 400 });
  }
}
