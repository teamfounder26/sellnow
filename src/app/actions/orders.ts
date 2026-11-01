"use server";
import { revalidatePath } from "next/cache";
import { requireWorkspace } from "@/lib/auth/session";
import { markFulfilled, refundOrder } from "@/lib/commerce/orders";
import { parseRinggitToSen } from "@/lib/money";
import { updateLead, setOptOut } from "@/lib/crm/service";
import { toActionError, type ActionResult } from "@/lib/errors";

export async function markFulfilledAction(orderId: string): Promise<ActionResult> {
  try {
    const { db, workspace, user } = await requireWorkspace("editor");
    await markFulfilled(db, { workspaceId: workspace.id, userId: user.id }, orderId);
    revalidatePath(`/dashboard/orders/${orderId}`);
    return { ok: true, data: undefined };
  } catch (e) {
    return toActionError(e);
  }
}

/** Refunds require owner/admin — enforced on the server, not just hidden in the UI. */
export async function refundOrderAction(orderId: string, amount: string): Promise<ActionResult> {
  try {
    const { db, workspace, user } = await requireWorkspace("admin");
    const sen = parseRinggitToSen(amount);
    if (sen === null) return { ok: false, error: "orders.badRefundAmount" };
    await refundOrder(db, { workspaceId: workspace.id, userId: user.id }, orderId, sen);
    revalidatePath("/dashboard", "layout");
    return { ok: true, data: undefined };
  } catch (e) {
    return toActionError(e);
  }
}

export async function updateLeadAction(leadId: string, patch: { status?: "new" | "contacted" | "qualified" | "won" | "lost"; humanTakeover?: boolean }): Promise<ActionResult> {
  try {
    const { db, workspace, user } = await requireWorkspace("editor");
    await updateLead(db, { workspaceId: workspace.id, userId: user.id }, leadId, patch);
    revalidatePath("/dashboard/customers");
    return { ok: true, data: undefined };
  } catch (e) {
    return toActionError(e);
  }
}

export async function setOptOutAction(customerId: string, optedOut: boolean): Promise<ActionResult> {
  try {
    const { db, workspace } = await requireWorkspace("editor");
    await setOptOut(db, workspace.id, customerId, optedOut);
    revalidatePath(`/dashboard/customers/${customerId}`);
    return { ok: true, data: undefined };
  } catch (e) {
    return toActionError(e);
  }
}
