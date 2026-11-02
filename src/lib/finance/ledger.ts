import { and, eq, inArray, isNull, notExists, sql } from "drizzle-orm";
import type { DB, Tx } from "@/lib/db";
import { ledgerEntries, settlementItems } from "@/lib/db/schema";
import { newId } from "@/lib/ids";
import { AppError } from "@/lib/errors";

/**
 * Accounts. Sign convention: debit > 0, credit < 0; every transaction sums to zero.
 *   provider_clearing      platform asset — money held by Billplz for Selltro Pay collections
 *   seller_payable         liability per tenant — what SellNow owes the seller (balance = −sum)
 *   platform_fee_revenue   SellNow's earned Selltro Pay platform fee (revenue = −sum)
 *   processing_fee_payable Billplz processing fee withheld from the collection
 *   payout_funding         money leaving through the payout rail (Billplz Payment Order)
 *   platform_adjustments   counter-account for approved manual adjustments
 */
export const ACCOUNTS = ["provider_clearing", "seller_payable", "platform_fee_revenue", "processing_fee_payable", "payout_funding", "platform_adjustments"] as const;
export type Account = (typeof ACCOUNTS)[number];
export type Posting = { account: Account; amountSen: number; workspaceId: string | null };

/**
 * Posts one balanced transaction. Idempotent per (sourceType, sourceId, account): replaying the
 * same source posts nothing (returns false). Never updates existing rows.
 */
export async function post(tx: Tx | DB, src: { sourceType: string; sourceId: string; memo?: string }, postings: Posting[]): Promise<boolean> {
  const lines = postings.filter((p) => p.amountSen !== 0);
  if (!lines.length) return false;
  if (lines.some((p) => !Number.isInteger(p.amountSen))) throw new AppError("ledger.notInteger");
  if (lines.reduce((a, p) => a + p.amountSen, 0) !== 0) throw new AppError("ledger.unbalanced");
  const accounts = new Set(lines.map((l) => l.account));
  if (accounts.size !== lines.length) throw new AppError("ledger.duplicateAccount");
  const txnId = newId("ltx");
  const rows = await tx
    .insert(ledgerEntries)
    .values(lines.map((p) => ({ id: newId("led"), txnId, workspaceId: p.workspaceId, account: p.account, amountSen: p.amountSen, sourceType: src.sourceType, sourceId: src.sourceId, memo: src.memo ?? null })))
    .onConflictDoNothing()
    .returning({ id: ledgerEntries.id });
  if (rows.length && rows.length !== lines.length) throw new AppError("ledger.partialPost"); // aborts the surrounding transaction
  return rows.length > 0;
}

export async function accountBalance(db: DB | Tx, account: Account, workspaceId?: string | null) {
  const [r] = await db
    .select({ s: sql<number>`coalesce(sum(${ledgerEntries.amountSen}),0)::int` })
    .from(ledgerEntries)
    .where(and(eq(ledgerEntries.account, account), workspaceId === undefined ? undefined : workspaceId === null ? isNull(ledgerEntries.workspaceId) : eq(ledgerEntries.workspaceId, workspaceId)));
  return Number(r?.s ?? 0);
}

/** Seller-payable postings not yet placed in any settlement (the carry-forward balance). */
export async function unallocatedSellerPostings(db: DB | Tx, workspaceIds?: string[]) {
  return db
    .select()
    .from(ledgerEntries)
    .where(
      and(
        eq(ledgerEntries.account, "seller_payable"),
        inArray(ledgerEntries.sourceType, ["payment", "refund", "adjustment", "reversal"]),
        workspaceIds ? inArray(ledgerEntries.workspaceId, workspaceIds) : undefined,
        notExists(db.select({ x: settlementItems.id }).from(settlementItems).where(and(eq(settlementItems.sourceType, ledgerEntries.sourceType), eq(settlementItems.sourceId, ledgerEntries.sourceId)))),
      ),
    );
}

/** Sum check across the whole ledger — must always be 0. Used by tests and System Health. */
export async function ledgerIntegrity(db: DB) {
  const [r] = await db.select({ s: sql<number>`coalesce(sum(${ledgerEntries.amountSen}),0)::int`, n: sql<number>`count(*)::int` }).from(ledgerEntries);
  const unbalanced = await db.execute(sql`select txn_id from ledger_entries group by txn_id having sum(amount_sen) <> 0 limit 5`);
  const rows = (unbalanced as unknown as { rows?: unknown[] }).rows ?? (unbalanced as unknown as unknown[]);
  return { total: Number(r?.s ?? 0), entries: Number(r?.n ?? 0), unbalancedTxns: Array.isArray(rows) ? rows.length : 0 };
}
