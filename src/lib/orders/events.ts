import type { DB, Tx } from "@/lib/db";
import { orderEvents } from "@/lib/db/schema";
import { newId } from "@/lib/ids";

/** Appends to an order's timeline. Keep data small and free of secrets. */
export async function orderEvent(db: DB | Tx, e: { workspaceId: string; orderId: string; type: string; actorUserId?: string | null; data?: Record<string, unknown> }) {
  await db.insert(orderEvents).values({ id: newId("oev"), workspaceId: e.workspaceId, orderId: e.orderId, type: e.type, actorUserId: e.actorUserId ?? null, data: e.data ?? {} });
}
