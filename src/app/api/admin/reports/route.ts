import { getAdmin } from "@/lib/admin/guard";
import { buildReport, REPORTS, type ReportKind } from "@/lib/admin/reports";
import { AppError } from "@/lib/errors";

/** Permission-controlled CSV exports for Superadmin (audited in buildReport). */
export async function GET(req: Request) {
  const a = await getAdmin();
  if (!a || !a.can("reports.export")) return new Response("Not found", { status: 404 });
  const sp = new URL(req.url).searchParams;
  const kind = sp.get("kind") as ReportKind;
  if (!(kind in REPORTS)) return new Response("Bad kind", { status: 400 });
  try {
    const csv = await buildReport(a.db, { userId: a.user.id, email: a.user.email, canPersonal: a.can("reports.exportPersonal") }, kind, { from: sp.get("from") ?? undefined, to: sp.get("to") ?? undefined, status: sp.get("status") ?? undefined });
    return new Response(`﻿${csv}`, { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="sellnow-${kind}-${new Date().toISOString().slice(0, 10)}.csv"`, "Cache-Control": "no-store" } });
  } catch (e) {
    return new Response(e instanceof AppError ? e.code : "Error", { status: 400 });
  }
}
