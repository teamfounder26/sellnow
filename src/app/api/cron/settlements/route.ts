import { and, eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { paymentTransactions } from "@/lib/db/schema";
import { cronAuthorized } from "@/lib/cron";
import { reconcilePayment, selltroEnvironment } from "@/lib/finance/selltro-pay";
import { executeBatch, runSettlementCycle } from "@/lib/finance/settlement";
import { getConfig } from "@/lib/finance/settings";
import { raiseAlert } from "@/lib/admin/alerts";

/**
 * Daily settlement worker (schedule at the configured execution time, Asia/Kuala_Lumpur):
 *  1. read-only reconciliation of paid Selltro Pay bills against Billplz,
 *  2. calculate today's T+1 batch (idempotent),
 *  3. execute ONLY when approval isn't required AND payouts are switched on — otherwise the batch
 *     waits for a Finance admin in Superadmin → Settlements.
 */
export async function POST(req: Request) {
  if (!cronAuthorized(req)) return new Response("Forbidden", { status: 403 });
  const db = await getDb();
  const env = selltroEnvironment();
  if (!env) return Response.json({ skipped: "selltro_unavailable" });
  let reconciled = 0;
  let mismatches = 0;
  if (env !== "test") {
    const open = await db.query.paymentTransactions.findMany({ where: and(eq(paymentTransactions.environment, env), eq(paymentTransactions.status, "PAID"), eq(paymentTransactions.reconcileStatus, "unreconciled")), limit: 300 });
    for (const p of open) {
      const r = await reconcilePayment(db, p.id).catch(() => null);
      if (r) reconciled++;
      if (r?.status === "mismatch") {
        mismatches++;
        await raiseAlert(db, { kind: "payment.reconcile_mismatch", severity: "critical", message: `Payment ${p.billId} differs from Billplz: ${r.note}`, dedupeKey: `reconcile:${p.id}`, link: "/admin/payments", workspaceId: p.workspaceId });
      }
    }
  }
  const { batch, created } = await runSettlementCycle(db, { environment: env });
  const cfg = await getConfig(db);
  let executed = null;
  if (batch.status === "QUEUED" && !cfg.settlement.requireApproval && (cfg.payoutsEnabled || env === "test")) executed = await executeBatch(db, null, batch.id);
  if (batch.status === "AWAITING_APPROVAL") await raiseAlert(db, { kind: "settlement.awaiting_approval", severity: "info", message: `Settlement batch ${batch.settlementDate} (${batch.tenantCount} sellers) is waiting for approval.`, dedupeKey: `approve:${batch.id}`, link: `/admin/settlements?batch=${batch.id}` });
  return Response.json({ environment: env, reconciled, mismatches, batch: { id: batch.id, date: batch.settlementDate, status: batch.status, created }, executed });
}
