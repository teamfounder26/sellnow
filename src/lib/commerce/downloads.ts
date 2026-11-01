import { and, eq, isNull, lt, gt, sql } from "drizzle-orm";
import type { DB } from "@/lib/db";
import { downloadEntitlements, orders, assets } from "@/lib/db/schema";
import { sha256 } from "@/lib/crypto";

export type DownloadCheck = { ok: true; asset: typeof assets.$inferSelect } | { ok: false; reason: "invalid" | "unpaid" | "expired" | "limit" | "revoked" };

/** Verifies entitlement + PAID order, then atomically consumes one download. */
export async function consumeDownload(db: DB, token: string): Promise<DownloadCheck> {
  const ent = await db.query.downloadEntitlements.findFirst({ where: eq(downloadEntitlements.tokenHash, sha256(token)) });
  if (!ent) return { ok: false, reason: "invalid" };
  if (ent.revokedAt) return { ok: false, reason: "revoked" };
  if (ent.expiresAt < new Date()) return { ok: false, reason: "expired" };
  const order = await db.query.orders.findFirst({ where: and(eq(orders.id, ent.orderId), eq(orders.workspaceId, ent.workspaceId)) });
  if (!order || order.paymentStatus !== "PAID") return { ok: false, reason: "unpaid" };
  const updated = await db
    .update(downloadEntitlements)
    .set({ downloadCount: sql`${downloadEntitlements.downloadCount} + 1` })
    .where(
      and(
        eq(downloadEntitlements.id, ent.id),
        lt(downloadEntitlements.downloadCount, downloadEntitlements.maxDownloads),
        isNull(downloadEntitlements.revokedAt),
        gt(downloadEntitlements.expiresAt, new Date()),
      ),
    )
    .returning({ id: downloadEntitlements.id });
  if (!updated.length) return { ok: false, reason: "limit" };
  const asset = await db.query.assets.findFirst({ where: and(eq(assets.id, ent.assetId), eq(assets.workspaceId, ent.workspaceId)) });
  if (!asset) return { ok: false, reason: "invalid" };
  return { ok: true, asset };
}
