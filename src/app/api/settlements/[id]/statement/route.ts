import { getWorkspaceContext } from "@/lib/auth/session";
import { settlementStatementCsv } from "@/lib/finance/settlement";
import { AppError } from "@/lib/errors";

/** Seller settlement statement (CSV). Owner/admin of the tenant only. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getWorkspaceContext("viewer");
  if (!ctx.workspace || (ctx.role !== "owner" && ctx.role !== "admin")) return new Response("Forbidden", { status: 403 });
  try {
    const csv = await settlementStatementCsv(ctx.db, ctx.workspace.id, (await params).id);
    return new Response(`﻿${csv}`, { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="settlement-statement.csv"`, "Cache-Control": "no-store" } });
  } catch (e) {
    return new Response(e instanceof AppError ? e.code : "Error", { status: 404 });
  }
}
