import { eq } from "drizzle-orm";
import type { DB } from "@/lib/db";
import { workspaces, workspaceMembers, businessProfiles } from "@/lib/db/schema";
import { newId } from "@/lib/ids";
import { allocateCredits } from "@/lib/billing/credits";
import { getPlan } from "@/lib/billing/plans";
import { audit } from "@/lib/audit";
import { AppError } from "@/lib/errors";
import { listMemberships } from "@/lib/auth/service";

export async function createWorkspace(db: DB, userId: string, name: string) {
  const owned = (await listMemberships(db, userId)).filter((m) => m.role === "owner");
  const plan = getPlan(owned[0]?.workspace.plan ?? "free");
  if (owned.length >= plan.entitlements.maxWorkspaces) throw new AppError("workspace.limitReached", { max: plan.entitlements.maxWorkspaces });
  const id = newId("ws");
  await db.transaction(async (tx) => {
    await tx.insert(workspaces).values({ id, name: name.trim().slice(0, 80) || "SellNow", createdBy: userId });
    await tx.insert(workspaceMembers).values({ workspaceId: id, userId, role: "owner" });
    await tx.insert(businessProfiles).values({ workspaceId: id });
    await allocateCredits(tx, id, getPlan("free").monthlyCredits, "allocation");
    await audit(tx, { workspaceId: id, actorUserId: userId, action: "workspace.created", entity: "workspace", entityId: id });
  });
  return id;
}

export async function renameWorkspace(db: DB, workspaceId: string, name: string) {
  await db.update(workspaces).set({ name: name.trim().slice(0, 80) }).where(eq(workspaces.id, workspaceId));
}
