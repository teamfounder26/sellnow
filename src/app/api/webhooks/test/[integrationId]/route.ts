import { loadIntegration, handleVerified } from "@/lib/payments/webhook";
import { TestGateway } from "@/lib/payments/test-gateway";
import { testGatewayAllowed } from "@/lib/payments/integrations";

export async function POST(req: Request, { params }: { params: Promise<{ integrationId: string }> }) {
  if (!testGatewayAllowed()) return new Response("Disabled", { status: 404 });
  const { integrationId } = await params;
  const found = await loadIntegration(integrationId, "test");
  if (!found) return new Response("Unknown integration", { status: 404 });
  const raw = await req.text();
  try {
    return handleVerified(found.row.workspaceId, TestGateway.verifyWebhook(raw, req.headers.get("x-sellnow-signature") ?? ""));
  } catch {
    return new Response("Invalid signature", { status: 400 });
  }
}
