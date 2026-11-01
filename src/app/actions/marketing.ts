"use server";
import { revalidatePath } from "next/cache";
import { ZodError } from "zod";
import { requireWorkspace } from "@/lib/auth/session";
import { getLocale } from "@/lib/i18n/server";
import * as m from "@/lib/marketing/service";
import { toActionError, type ActionResult } from "@/lib/errors";
import { rateLimit } from "@/lib/rate-limit";
import { getPlan } from "@/lib/billing/plans";

export async function generateCreativeAction(input: { productId: string; type: string; objective: string; style: string; ratio?: string }): Promise<ActionResult> {
  try {
    const { db, workspace, user } = await requireWorkspace("editor");
    if (!rateLimit(`ai:${user.id}`, 30, 10 * 60 * 1000).ok) return { ok: false, error: "errors.rateLimited" };
    await m.generateTextCreative({ db, workspaceId: workspace.id, userId: user.id, locale: await getLocale() }, input as never);
    revalidatePath("/dashboard/creative");
    return { ok: true, data: undefined };
  } catch (e) {
    if (e instanceof ZodError) return { ok: false, error: "errors.validation" };
    return toActionError(e);
  }
}

export async function setCreativeStatusAction(id: string, status: "draft" | "approved"): Promise<ActionResult> {
  try {
    const { db, workspace, user } = await requireWorkspace("editor");
    await m.setCreativeStatus(db, { workspaceId: workspace.id, userId: user.id }, id, status);
    revalidatePath("/dashboard/creative");
    return { ok: true, data: undefined };
  } catch (e) {
    return toActionError(e);
  }
}

export async function createCampaignAction(input: Parameters<typeof m.createCampaignDraft>[2]): Promise<ActionResult> {
  try {
    const { db, workspace, user } = await requireWorkspace("editor");
    await m.createCampaignDraft(db, { workspaceId: workspace.id, userId: user.id }, input);
    revalidatePath("/dashboard/marketing");
    return { ok: true, data: undefined };
  } catch (e) {
    if (e instanceof ZodError) return { ok: false, error: e.issues[0]?.message.includes(".") ? e.issues[0].message : "errors.validation" };
    return toActionError(e);
  }
}

/** Spending approval: owner/admin only. */
export async function approveCampaignAction(id: string): Promise<ActionResult> {
  try {
    const { db, workspace, user } = await requireWorkspace("admin");
    await m.approveCampaign(db, { workspaceId: workspace.id, userId: user.id }, id);
    revalidatePath("/dashboard/marketing");
    return { ok: true, data: undefined };
  } catch (e) {
    return toActionError(e);
  }
}

export async function publishCampaignAction(id: string): Promise<ActionResult> {
  try {
    const { db, workspace, user } = await requireWorkspace("admin");
    if (!getPlan(workspace.plan).entitlements.marketing) return { ok: false, error: "marketing.lockedPlan" };
    await m.publishCampaign(db, { workspaceId: workspace.id, userId: user.id }, id);
    revalidatePath("/dashboard/marketing");
    return { ok: true, data: undefined };
  } catch (e) {
    return toActionError(e);
  }
}
