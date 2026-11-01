import type { DB, Tx } from "@/lib/db";
import { auditLogs, analyticsEvents, notifications } from "@/lib/db/schema";
import { newId } from "@/lib/ids";

export async function audit(
  db: DB | Tx,
  e: { workspaceId: string | null; actorUserId?: string | null; action: string; entity?: string; entityId?: string; data?: Record<string, unknown> },
) {
  await db.insert(auditLogs).values({
    id: newId("aud"),
    workspaceId: e.workspaceId,
    actorUserId: e.actorUserId ?? null,
    action: e.action,
    entity: e.entity,
    entityId: e.entityId,
    data: e.data ?? {},
  });
}

/** Product funnel analytics. Never put customer PII in props. */
export async function track(db: DB | Tx, name: string, e: { workspaceId?: string | null; userId?: string | null; props?: Record<string, unknown> } = {}) {
  await db.insert(analyticsEvents).values({
    id: newId("evt"),
    workspaceId: e.workspaceId ?? null,
    userId: e.userId ?? null,
    name,
    props: e.props ?? {},
  });
}

export async function notify(db: DB | Tx, workspaceId: string, type: string, data: Record<string, unknown> = {}) {
  await db.insert(notifications).values({ id: newId("ntf"), workspaceId, type, data });
}
