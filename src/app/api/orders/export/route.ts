import { getWorkspaceContext } from "@/lib/auth/session";
import { ORDER_TABS, ordersCsv, searchOrders, type OrderTab } from "@/lib/orders/service";
import { audit } from "@/lib/audit";

/** CSV export of the seller's own orders with the same filters as the list. */
export async function GET(req: Request) {
  const ctx = await getWorkspaceContext("viewer");
  if (!ctx.workspace || !ctx.role || ctx.role === "viewer") return new Response("Forbidden", { status: 403 });
  const sp = new URL(req.url).searchParams;
  const tab = (ORDER_TABS as readonly string[]).includes(sp.get("tab") ?? "") ? (sp.get("tab") as OrderTab) : "all";
  const rows = await searchOrders(ctx.db, ctx.workspace.id, { tab, q: sp.get("q") ?? undefined, from: sp.get("from") ?? undefined, to: sp.get("to") ?? undefined, payment: sp.get("payment") ?? undefined, method: sp.get("method") ?? undefined, courier: sp.get("courier") ?? undefined, limit: 1000 });
  await audit(ctx.db, { workspaceId: ctx.workspace.id, actorUserId: ctx.user.id, action: "orders.exported", data: { tab, rows: rows.length } });
  return new Response(`﻿${ordersCsv(rows)}`, { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="orders-${tab}.csv"`, "Cache-Control": "no-store" } });
}
