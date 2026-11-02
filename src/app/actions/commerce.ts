"use server";
import { revalidatePath } from "next/cache";
import { ZodError } from "zod";
import { requireWorkspace } from "@/lib/auth/session";
import { appUrl } from "@/lib/http";
import { rateLimit } from "@/lib/rate-limit";
import { AppError, toActionError, type ActionResult } from "@/lib/errors";
import type { Role } from "@/lib/auth/service";
import type { CourierProvider } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { sellerBankAccounts, sellerPaymentAccounts } from "@/lib/db/schema";
import { audit } from "@/lib/audit";
import { changeBankAccount, submitActivation, currentBankAccount } from "@/lib/finance/selltro-pay";
import { saveOrderSettings } from "@/lib/orders/settings";
import { deleteRule, importRules, saveRule, saveZone } from "@/lib/shipping/rules";
import { sellerCancelOrder, verifyManualTransfer } from "@/lib/orders/service";
import * as cs from "@/lib/couriers/service";
import { enqueueJob } from "@/lib/jobs/runner";
import { kickJob } from "@/lib/jobs/kick";
import { selltroEnvironment } from "@/lib/finance/selltro-pay";

async function ctx(min: Role = "editor") {
  const { user, db, workspace } = await requireWorkspace(min);
  return { db, workspaceId: workspace.id, userId: user.id };
}
function done<T>(data: T, path = "/dashboard"): ActionResult<T> {
  revalidatePath(path, "layout");
  return { ok: true, data };
}
function fail(e: unknown): { ok: false; error: string; params?: Record<string, string | number> } {
  if (e instanceof ZodError) {
    const m = e.issues[0]?.message ?? "";
    return { ok: false, error: m.includes(".") && !m.includes(" ") ? m : "errors.validation" };
  }
  return toActionError(e);
}
async function run<T>(min: Role, fn: (c: Awaited<ReturnType<typeof ctx>>) => Promise<T>): Promise<ActionResult<T>> {
  try {
    return done(await fn(await ctx(min)));
  } catch (e) {
    return fail(e);
  }
}

// ---------------- Selltro Pay (owner only: payout destination is the owner's decision)
export const activateSelltroAction = async (raw: unknown) => run("owner", (c) => submitActivation(c.db, c, raw));
export const changeBankAction = async (password: string, bank: unknown) => run("owner", (c) => changeBankAccount(c.db, c, { password, bank }));
/** Test mode only: lets a developer complete verification locally (no money exists in test mode). Audited. */
export async function selfVerifyTestAction(): Promise<ActionResult<undefined>> {
  return run("owner", async (c) => {
    if (selltroEnvironment() !== "test") throw new AppError("errors.forbidden");
    const acct = await c.db.query.sellerPaymentAccounts.findFirst({ where: eq(sellerPaymentAccounts.workspaceId, c.workspaceId) });
    if (!acct || acct.status !== "PENDING_VERIFICATION") throw new AppError("selltro.notActivated");
    await c.db.update(sellerPaymentAccounts).set({ status: "ACTIVE", reviewNote: "test mode self-verification", reviewedAt: new Date() }).where(eq(sellerPaymentAccounts.workspaceId, c.workspaceId));
    const b = await currentBankAccount(c.db, c.workspaceId);
    if (b) await c.db.update(sellerBankAccounts).set({ status: "VERIFIED", reviewNote: "test mode self-verification", reviewedAt: new Date() }).where(eq(sellerBankAccounts.id, b.id));
    await audit(c.db, { workspaceId: c.workspaceId, actorUserId: c.userId, action: "selltro.test_self_verified" });
    return undefined;
  });
}

// ---------------- Order payment methods & postage
export const saveOrderSettingsAction = async (raw: unknown) => run("admin", (c) => saveOrderSettings(c.db, c, raw));
export const saveShippingRuleAction = async (raw: unknown, id?: string) => run("admin", (c) => saveRule(c.db, c, raw, id));
export const deleteShippingRuleAction = async (id: string) => run("admin", (c) => deleteRule(c.db, c, id));
export const saveShippingZoneAction = async (raw: unknown) => run("admin", (c) => saveZone(c.db, c, raw));
export const importShippingRulesAction = async (csv: string) => run("admin", (c) => importRules(c.db, c, csv.slice(0, 200_000)));
export const saveShipperAction = async (raw: unknown) => run("admin", (c) => cs.saveShipper(c, raw));

// ---------------- Couriers
export const connectCourierAction = async (provider: CourierProvider, raw: { credentials?: Record<string, string>; accountLabel?: string; codEnabled?: boolean }) => run("admin", (c) => cs.connectCourier(c, provider, raw));
export const disconnectCourierAction = async (provider: CourierProvider) => run("admin", (c) => cs.disconnectCourier(c, provider));
export const setDefaultCourierAction = async (provider: CourierProvider) => run("admin", (c) => cs.setDefaultCourier(c, provider));
export const testCourierAction = async (provider: CourierProvider) => run("admin", (c) => cs.testCourier(c, provider));

// ---------------- Orders
export const quoteOrderAction = async (orderId: string) => run("editor", (c) => cs.quoteForOrder(c, orderId));
export async function pushOrderAction(orderId: string, raw: unknown): Promise<ActionResult<{ shipmentId: string; trackingNumber: string | null }>> {
  try {
    const c = await ctx("editor");
    if (!rateLimit(`push:${c.userId}`, 60, 10 * 60 * 1000).ok) return { ok: false, error: "errors.rateLimited" };
    return done(await cs.pushOrder(c, orderId, raw, await appUrl()));
  } catch (e) {
    return fail(e);
  }
}
export const manualShipmentAction = async (orderId: string, raw: unknown) => run("editor", (c) => cs.recordManualShipment(c, orderId, raw));
export const markDeliveredAction = async (shipmentId: string) => run("editor", (c) => cs.markManualDelivered(c, shipmentId));
export const cancelShipmentAction = async (shipmentId: string) => run("admin", (c) => cs.cancelShipment(c, shipmentId));
export const verifyTransferAction = async (orderId: string, approve: boolean, note?: string) => run("admin", (c) => verifyManualTransfer(c.db, c, orderId, approve, note));
export const cancelOrderAction = async (orderId: string, reason: string) => run("admin", (c) => sellerCancelOrder(c.db, c, orderId, reason));
export const recordCodAction = async (orderId: string, amountSen: number, reference: string) => run("admin", (c) => cs.recordCodRemittance(c.db, c.workspaceId, orderId, amountSen, reference, c.userId));
export const reconcileCodAction = async (orderId: string) => run("admin", (c) => cs.reconcileCod(c, orderId));
export const bulkPreviewAction = async (orderIds: string[]) => run("editor", (c) => cs.bulkPreview(c, orderIds));
export async function bulkPushAction(orderIds: string[], service: string): Promise<ActionResult<{ jobId: string }>> {
  try {
    const c = await ctx("editor");
    const preview = await cs.bulkPreview(c, orderIds);
    if (!preview.ready.length) throw new AppError("shipments.noneReady");
    const { job } = await enqueueJob(c.db, { workspaceId: c.workspaceId, userId: c.userId, kind: "courier.bulkPush", input: { orderIds: preview.ready.map((r) => r.orderId), service, base: await appUrl() } });
    kickJob(job.id);
    return { ok: true, data: { jobId: job.id } };
  } catch (e) {
    return fail(e);
  }
}

/** "Test calculation" in the postage table — the same rule engine checkout uses. */
export const testShippingAction = async (input: { postcode: string; state: string; weightGrams: number; type: "normal" | "cod" }) =>
  run("viewer", async (c) => {
    const { listRules, listZones, pickRule } = await import("@/lib/shipping/rules");
    const { regionForPostcode, addressConsistent } = await import("@/lib/shipping/zones");
    const region = regionForPostcode(input.postcode);
    if (!region || !addressConsistent(input.postcode, input.state)) throw new AppError("shipping.addressMismatch");
    const [rules, zones] = await Promise.all([listRules(c.db, c.workspaceId), listZones(c.db, c.workspaceId)]);
    return pickRule(rules, zones, { postcode: input.postcode, state: input.state, region }, input.weightGrams, input.type);
  });
