import { getWorkspaceContext } from "@/lib/auth/session";
import { awbFor, bulkAwb } from "@/lib/couriers/service";
import { AppError } from "@/lib/errors";

/** AWB download (single or merged bulk). Only the caller's own tenant's shipments. */
export async function GET(req: Request) {
  const ctx = await getWorkspaceContext("viewer");
  if (!ctx.workspace) return new Response("Forbidden", { status: 403 });
  const ids = (new URL(req.url).searchParams.get("ids") ?? "").split(",").filter(Boolean);
  try {
    const out = ids.length === 1 ? await awbFor(ctx.db, ctx.workspace.id, ids[0]!) : { ...(await bulkAwb(ctx.db, ctx.workspace.id, ids)), name: `AWB-bulk-${ids.length}.pdf` };
    return new Response(new Uint8Array(out.pdf), { headers: { "Content-Type": "application/pdf", "Content-Disposition": `inline; filename="${out.name}"`, "Cache-Control": "private, no-store" } });
  } catch (e) {
    return new Response(e instanceof AppError ? e.code : "Error", { status: e instanceof AppError && e.code === "errors.forbidden" ? 403 : 400 });
  }
}
