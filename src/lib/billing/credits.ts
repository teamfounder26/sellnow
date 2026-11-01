import { and, eq, sql } from "drizzle-orm";
import type { DB, Tx } from "@/lib/db";
import { aiCreditLedger, workspaces } from "@/lib/db/schema";
import { newId } from "@/lib/ids";

export async function creditBalance(db: DB | Tx, workspaceId: string): Promise<number> {
  const [row] = await db
    .select({ total: sql<number>`coalesce(sum(${aiCreditLedger.delta}), 0)::int` })
    .from(aiCreditLedger)
    .where(eq(aiCreditLedger.workspaceId, workspaceId));
  return Number(row?.total ?? 0);
}

export async function allocateCredits(db: DB | Tx, workspaceId: string, amount: number, reason = "allocation") {
  await db.insert(aiCreditLedger).values({ id: newId("crd"), workspaceId, delta: amount, reason });
}

/** Locks the workspace row so concurrent debits are serialized (prevents overspending credits). */
export async function lockWorkspace(tx: Tx, workspaceId: string) {
  await tx.select({ id: workspaces.id }).from(workspaces).where(eq(workspaces.id, workspaceId)).for("update");
}

export async function refundGeneration(db: DB | Tx, workspaceId: string, generationId: string, amount: number) {
  const existing = await db.query.aiCreditLedger.findFirst({
    where: and(eq(aiCreditLedger.generationId, generationId), eq(aiCreditLedger.reason, "refund_failed_generation")),
  });
  if (existing) return;
  await db
    .insert(aiCreditLedger)
    .values({ id: newId("crd"), workspaceId, delta: amount, reason: "refund_failed_generation", generationId })
    .onConflictDoNothing();
}
