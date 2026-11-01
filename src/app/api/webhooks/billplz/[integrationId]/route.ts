import { loadIntegration, handleVerified } from "@/lib/payments/webhook";
import { readSecrets } from "@/lib/payments/integrations";
import { BillplzGateway } from "@/lib/payments/billplz";
import type { BillplzSecrets } from "@/lib/payments/types";
import { log } from "@/lib/log";

export async function POST(req: Request, { params }: { params: Promise<{ integrationId: string }> }) {
  const { integrationId } = await params;
  const found = await loadIntegration(integrationId, "billplz");
  if (!found) return new Response("Unknown integration", { status: 404 });
  const form = new URLSearchParams(await req.text());
  const data = Object.fromEntries(form.entries());
  try {
    const ev = BillplzGateway.verifyCallback(data, readSecrets<BillplzSecrets>(found.row));
    return handleVerified(found.row.workspaceId, ev);
  } catch (e) {
    log("warn", "payment.webhook.invalid_signature", { provider: "billplz", integrationId, error: String(e) });
    return new Response("Invalid signature", { status: 400 });
  }
}
