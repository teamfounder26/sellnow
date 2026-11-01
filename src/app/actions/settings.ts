"use server";
import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { requireWorkspace } from "@/lib/auth/session";
import { connectPaymentProvider, disconnectPaymentProvider } from "@/lib/payments/integrations";
import { discountCodes } from "@/lib/db/schema";
import { newId } from "@/lib/ids";
import { parseRinggitToSen } from "@/lib/money";
import { audit } from "@/lib/audit";
import { toActionError, type ActionResult } from "@/lib/errors";
import type { PaymentProvider } from "@/lib/payments/types";

async function owner() {
  const { db, workspace, user } = await requireWorkspace("owner");
  return { db, ctx: { workspaceId: workspace.id, userId: user.id } };
}
const ok = (): ActionResult => {
  revalidatePath("/dashboard", "layout");
  return { ok: true, data: undefined };
};

export async function connectStripeAction(secretKey: string, webhookSecret: string): Promise<ActionResult> {
  try {
    const sk = secretKey.trim();
    const wh = webhookSecret.trim();
    if (!/^(sk|rk)_(live|test)_[A-Za-z0-9]{10,}$/.test(sk) || !/^whsec_[A-Za-z0-9+/=]{10,}$/.test(wh)) return { ok: false, error: "payments.invalidKey" };
    const { db, ctx } = await owner();
    await connectPaymentProvider(db, ctx, "stripe", { mode: sk.includes("_live_") ? "live" : "test", secrets: { secretKey: sk, webhookSecret: wh } });
    return ok();
  } catch (e) {
    return toActionError(e);
  }
}

export async function connectBillplzAction(input: { apiKey: string; xSignatureKey: string; collectionId: string; mode: "test" | "live" }): Promise<ActionResult> {
  try {
    const p = z.object({ apiKey: z.string().trim().min(10), xSignatureKey: z.string().trim().min(10), collectionId: z.string().trim().min(3).max(40), mode: z.enum(["test", "live"]) }).safeParse(input);
    if (!p.success) return { ok: false, error: "payments.invalidKey" };
    const { db, ctx } = await owner();
    await connectPaymentProvider(db, ctx, "billplz", { mode: p.data.mode, secrets: { apiKey: p.data.apiKey, xSignatureKey: p.data.xSignatureKey, collectionId: p.data.collectionId } });
    return ok();
  } catch (e) {
    return toActionError(e);
  }
}

export async function connectTestGatewayAction(): Promise<ActionResult> {
  try {
    const { db, ctx } = await owner();
    await connectPaymentProvider(db, ctx, "test", { mode: "test" });
    return ok();
  } catch (e) {
    return toActionError(e);
  }
}

export async function disconnectProviderAction(provider: PaymentProvider): Promise<ActionResult> {
  try {
    const { db, ctx } = await owner();
    await disconnectPaymentProvider(db, ctx, provider);
    return ok();
  } catch (e) {
    return toActionError(e);
  }
}

export async function addDiscountAction(input: { code: string; kind: "percent" | "fixed"; value: string; max: string }): Promise<ActionResult> {
  try {
    const { db, workspace, user } = await requireWorkspace("admin");
    const code = input.code.trim().toUpperCase();
    if (!/^[A-Z0-9_-]{3,30}$/.test(code)) return { ok: false, error: "settings.badDiscount" };
    const value = input.kind === "percent" ? Number(input.value) : parseRinggitToSen(input.value);
    if (value === null || !Number.isInteger(value) || value <= 0 || (input.kind === "percent" && value > 100)) return { ok: false, error: "settings.badDiscount" };
    const max = input.max.trim() ? Number(input.max) : null;
    if (max !== null && (!Number.isInteger(max) || max < 1)) return { ok: false, error: "settings.badDiscount" };
    const exists = await db.query.discountCodes.findFirst({ where: and(eq(discountCodes.workspaceId, workspace.id), eq(discountCodes.code, code)) });
    if (exists) return { ok: false, error: "settings.badDiscount" };
    await db.insert(discountCodes).values({ id: newId("dc"), workspaceId: workspace.id, code, kind: input.kind, value, maxRedemptions: max });
    await audit(db, { workspaceId: workspace.id, actorUserId: user.id, action: "discount.created", data: { code } });
    return ok();
  } catch (e) {
    return toActionError(e);
  }
}

export async function toggleDiscountAction(id: string, active: boolean): Promise<ActionResult> {
  try {
    const { db, workspace } = await requireWorkspace("admin");
    await db.update(discountCodes).set({ active }).where(and(eq(discountCodes.id, id), eq(discountCodes.workspaceId, workspace.id)));
    return ok();
  } catch (e) {
    return toActionError(e);
  }
}

/** Owner/admin only: runs the real server-side AI provider connectivity test (spends a few tokens). */
export async function testAIConnectionAction(): Promise<ActionResult<import("@/lib/ai/connection-test").ConnectionReport>> {
  try {
    const { user } = await requireWorkspace("admin");
    const { rateLimit } = await import("@/lib/rate-limit");
    if (!rateLimit(`aitest:${user.id}`, 5, 10 * 60 * 1000).ok) return { ok: false, error: "errors.rateLimited" };
    const { testAIConnection } = await import("@/lib/ai/connection-test");
    return { ok: true, data: await testAIConnection() };
  } catch (e) {
    return toActionError(e);
  }
}
