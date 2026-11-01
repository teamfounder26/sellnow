"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { and, eq, isNull } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { requireUser, setActiveWorkspace, requireWorkspace } from "@/lib/auth/session";
import { assertMember } from "@/lib/auth/service";
import { createWorkspace, renameWorkspace } from "@/lib/workspace/service";
import { AppError, toActionError, type ActionResult } from "@/lib/errors";
import { notifications } from "@/lib/db/schema";

export async function switchWorkspaceAction(workspaceId: string) {
  const user = await requireUser();
  await assertMember(await getDb(), user.id, workspaceId, "viewer");
  await setActiveWorkspace(workspaceId);
  revalidatePath("/", "layout");
  redirect("/dashboard");
}

export async function createWorkspaceAction(): Promise<ActionResult> {
  const user = await requireUser();
  try {
    const id = await createWorkspace(await getDb(), user.id, "New Business");
    await setActiveWorkspace(id);
  } catch (e) {
    return toActionError(e);
  }
  redirect("/onboarding");
}

export async function renameWorkspaceAction(_: unknown, form: FormData): Promise<ActionResult> {
  try {
    const { db, workspace } = await requireWorkspace("admin");
    const name = String(form.get("name") ?? "").trim();
    if (name.length < 2) throw new AppError("errors.validation");
    await renameWorkspace(db, workspace.id, name);
    revalidatePath("/dashboard", "layout");
    return { ok: true, data: undefined };
  } catch (e) {
    return toActionError(e);
  }
}

export async function markNotificationsReadAction() {
  const { db, workspace } = await requireWorkspace("viewer");
  await db.update(notifications).set({ readAt: new Date() }).where(and(eq(notifications.workspaceId, workspace.id), isNull(notifications.readAt)));
  revalidatePath("/dashboard", "layout");
}

/** Reward modal buttons. Only presentation state changes — the unlock record is permanent. */
export async function rewardAction(notificationId: string, action: "collect" | "dismiss"): Promise<ActionResult> {
  try {
    const { db, workspace } = await requireWorkspace("viewer");
    const { markReward } = await import("@/lib/achievements/service");
    await markReward(db, workspace.id, notificationId, action);
    revalidatePath("/dashboard", "layout");
    return { ok: true, data: undefined };
  } catch (e) {
    return toActionError(e);
  }
}
