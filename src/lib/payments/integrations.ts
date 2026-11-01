import { and, eq } from "drizzle-orm";
import type { DB } from "@/lib/db";
import { integrations } from "@/lib/db/schema";
import { decryptSecret, encryptSecret } from "@/lib/crypto";
import { newId } from "@/lib/ids";
import { AppError } from "@/lib/errors";
import { audit, track } from "@/lib/audit";
import type { PaymentProvider } from "./types";

export function testGatewayAllowed() {
  return process.env.NODE_ENV !== "production" || process.env.ALLOW_TEST_GATEWAY === "true";
}

export async function getPaymentIntegration(db: DB, workspaceId: string) {
  return (
    (await db.query.integrations.findFirst({
      where: and(eq(integrations.workspaceId, workspaceId), eq(integrations.kind, "payment"), eq(integrations.status, "connected")),
    })) ?? null
  );
}

export async function listIntegrations(db: DB, workspaceId: string) {
  const rows = await db.query.integrations.findMany({ where: eq(integrations.workspaceId, workspaceId) });
  // Never leak ciphertext to callers that render UI.
  return rows.map(({ secretCiphertext, ...r }) => ({ ...r, hasSecrets: Boolean(secretCiphertext) }));
}

export function readSecrets<T>(row: { secretCiphertext: string | null }): T {
  if (!row.secretCiphertext) throw new AppError("payments.notConfigured");
  return JSON.parse(decryptSecret(row.secretCiphertext)) as T;
}

/** Only one payment provider is active per workspace; connecting one disconnects the others. */
export async function connectPaymentProvider(
  db: DB,
  ctx: { workspaceId: string; userId: string },
  provider: PaymentProvider,
  opts: { mode: "test" | "live"; secrets?: Record<string, string>; publicConfig?: Record<string, string> },
) {
  if (provider === "test" && !testGatewayAllowed()) throw new AppError("payments.testGatewayDisabled");
  const secretCiphertext = opts.secrets ? encryptSecret(JSON.stringify(opts.secrets)) : null;
  await db.transaction(async (tx) => {
    await tx
      .update(integrations)
      .set({ status: "disconnected", updatedAt: new Date() })
      .where(and(eq(integrations.workspaceId, ctx.workspaceId), eq(integrations.kind, "payment")));
    const existing = await tx.query.integrations.findFirst({ where: and(eq(integrations.workspaceId, ctx.workspaceId), eq(integrations.provider, provider)) });
    const values = {
      kind: "payment",
      provider,
      mode: provider === "test" ? "test" : opts.mode,
      status: "connected",
      publicConfig: opts.publicConfig ?? {},
      secretCiphertext,
      lastError: null,
      updatedAt: new Date(),
    };
    if (existing) await tx.update(integrations).set(values).where(eq(integrations.id, existing.id));
    else await tx.insert(integrations).values({ id: newId("int"), workspaceId: ctx.workspaceId, ...values });
    await audit(tx, { workspaceId: ctx.workspaceId, actorUserId: ctx.userId, action: "payments.connected", data: { provider, mode: values.mode } });
  });
  await track(db, "payment_connected", { workspaceId: ctx.workspaceId, props: { provider } });
}

export async function disconnectPaymentProvider(db: DB, ctx: { workspaceId: string; userId: string }, provider: PaymentProvider) {
  await db
    .update(integrations)
    .set({ status: "disconnected", updatedAt: new Date() })
    .where(and(eq(integrations.workspaceId, ctx.workspaceId), eq(integrations.provider, provider)));
  await audit(db, { workspaceId: ctx.workspaceId, actorUserId: ctx.userId, action: "payments.disconnected", data: { provider } });
}
