"use server";
import { revalidatePath } from "next/cache";
import { ZodError } from "zod";
import { toActionError, type ActionResult } from "@/lib/errors";
import { adminAction } from "@/lib/admin/guard";
import type { Permission } from "@/lib/admin/permissions";
import type { AdminRole, PlanEntitlements, TenantSubStatus } from "@/lib/db/schema";
import * as st from "@/lib/finance/settlement";
import { reviewBankAccount, reviewSellerAccount, reconcilePayment, selltroEnvironment } from "@/lib/finance/selltro-pay";
import { setConfig, type PlatformConfig } from "@/lib/finance/settings";
import { confirmIdentity } from "@/lib/auth/stepup";
import { savePlan, setOverride, setSubscriptionStatus, setTenantPlan } from "@/lib/admin/packages";
import { addTenantNote, setAdminRole, suspendTenant, unsuspendTenant } from "@/lib/admin/ops";
import { resolveAlert } from "@/lib/admin/alerts";

async function run<T>(p: Permission, fn: (a: Awaited<ReturnType<typeof adminAction>>) => Promise<T>): Promise<ActionResult<T>> {
  try {
    const a = await adminAction(p);
    const data = await fn(a);
    revalidatePath("/admin", "layout");
    return { ok: true, data };
  } catch (e) {
    if (e instanceof ZodError) return { ok: false, error: "errors.validation" };
    return toActionError(e);
  }
}

// ---------------- settlements & payouts
export const runCycleAction = async () => run("settlements.execute", async (a) => (await st.runSettlementCycle(a.db, { environment: selltroEnvironment() ?? undefined })).batch.id);
export const approveBatchAction = async (batchId: string, password: string) => run("settlements.approve", (a) => st.approveBatch(a.db, a.user.id, batchId, password));
export const executeBatchAction = async (batchId: string, password: string) =>
  run("settlements.execute", async (a) => {
    await confirmIdentity(a.db, a.user.id, password);
    return st.executeBatch(a.db, a.user.id, batchId);
  });
export const holdSettlementAction = async (id: string, reason: string) => run("settlements.hold", (a) => st.holdSettlement(a.db, a.user.id, id, reason));
export const releaseSettlementAction = async (id: string, password: string) => run("settlements.hold", (a) => st.releaseSettlementHold(a.db, a.user.id, id, password));
export const retrySettlementAction = async (id: string, password: string) =>
  run("settlements.execute", async (a) => {
    await confirmIdentity(a.db, a.user.id, password);
    return st.retryFailedSettlement(a.db, a.user.id, id);
  });
export const reconcileUnknownAction = async (id: string, outcome: "completed" | "failed", note: string, password: string) => run("settlements.execute", (a) => st.reconcileUnknownPayout(a.db, a.user.id, id, outcome, note, password));
export const sellerHoldAction = async (workspaceId: string, reason: string) => run("settlements.hold", (a) => st.placeSellerHold(a.db, a.user.id, workspaceId, reason));
export const releaseSellerHoldAction = async (holdId: string, password: string) => run("settlements.hold", (a) => st.releaseSellerHold(a.db, a.user.id, holdId, password));
export const createAdjustmentAction = async (workspaceId: string, amountSen: number, reason: string) => run("settlements.adjust", (a) => st.createAdjustment(a.db, a.user.id, workspaceId, amountSen, reason));
export const decideAdjustmentAction = async (id: string, approve: boolean, password: string) => run("settlements.adjust", (a) => st.decideAdjustment(a.db, a.user.id, id, approve, password));

// ---------------- payments & seller verification
export const reconcilePaymentAction = async (paymentTxId: string) => run("payments.refresh", (a) => reconcilePayment(a.db, paymentTxId));
export const reviewSellerAction = async (workspaceId: string, decision: "approve" | "restrict" | "suspend" | "reject", note: string) => run("payments.reviewSellers", (a) => reviewSellerAccount(a.db, a.user.id, workspaceId, decision, note));
export const reviewBankAction = async (bankId: string, decision: "verify" | "reject" | "suspend", note: string, password: string) =>
  run("payments.reviewSellers", async (a) => {
    await confirmIdentity(a.db, a.user.id, password);
    return reviewBankAccount(a.db, a.user.id, bankId, decision, note);
  });

// ---------------- tenants, packages, admins, platform
export const suspendTenantAction = async (workspaceId: string, reason: string, password: string) => run("tenants.suspend", (a) => suspendTenant(a.db, a.user.id, workspaceId, reason, password));
export const unsuspendTenantAction = async (workspaceId: string, password: string) => run("tenants.suspend", (a) => unsuspendTenant(a.db, a.user.id, workspaceId, password));
export const tenantNoteAction = async (workspaceId: string, kind: "note" | "risk_flag" | "support", body: string) => run("tenants.notes", (a) => addTenantNote(a.db, a.user.id, workspaceId, kind, body));
export const tenantPlanAction = async (workspaceId: string, planId: string, reason: string, when: "now" | "period_end") => run("tenants.planOverride", (a) => setTenantPlan(a.db, a.user.id, workspaceId, planId, { reason, when }));
export const tenantSubStatusAction = async (workspaceId: string, status: TenantSubStatus, reason: string) => run("tenants.planOverride", (a) => setSubscriptionStatus(a.db, a.user.id, workspaceId, status, reason));
export const tenantOverrideAction = async (workspaceId: string, key: keyof PlanEntitlements, value: unknown, reason: string) => run("tenants.planOverride", (a) => setOverride(a.db, a.user.id, workspaceId, key, value, reason));
export const savePlanAction = async (raw: unknown) => run("packages.edit", (a) => savePlan(a.db, a.user.id, raw));
export const setAdminRoleAction = async (email: string, role: AdminRole | "remove", password: string) => run("admins.manage", (a) => setAdminRole(a.db, a.user.id, email, role, password));
export const resolveAlertAction = async (id: string) => run("overview.view", (a) => resolveAlert(a.db, id, a.user.id));
/** Platform configuration. Money switches (payouts, live approval) need the owner's password every time. */
export async function setConfigAction<K extends keyof PlatformConfig>(key: K, value: PlatformConfig[K], password: string) {
  return run("settings.edit", async (a) => {
    await confirmIdentity(a.db, a.user.id, password);
    await setConfig(a.db, a.user.id, key, value);
  });
}
