import { describe, it, expect, beforeAll } from "vitest";
import { eq } from "drizzle-orm";
import { makeDb, makeLiveStore, makeSeller } from "./helpers";
import type { DB } from "@/lib/db";
import { auditLogs, platformAdmins, products, workspaces } from "@/lib/db/schema";
import { registerUser } from "@/lib/auth/service";
import { can } from "@/lib/admin/permissions";
import { entitlementsFor, listPlans, savePlan, setOverride, setTenantPlan } from "@/lib/admin/packages";
import { setAdminRole, suspendTenant } from "@/lib/admin/ops";
import { buildReport } from "@/lib/admin/reports";
import { overview, tenantDirectory, tenantDetail } from "@/lib/admin/platform";
import { createProduct } from "@/lib/products/service";
import { createCheckout } from "@/lib/commerce/checkout";
import { sambal } from "./helpers";
import { newId } from "@/lib/ids";

let db: DB;
let owner: { id: string; email: string };
beforeAll(async () => {
  db = await makeDb();
  const u = await registerUser(db, { name: "Platform Owner", email: `owner-${Date.now()}@sellnow.test`, password: "password123" });
  owner = { id: u.id, email: u.email };
  await db.insert(platformAdmins).values({ userId: u.id, role: "owner", createdBy: "test" });
});

describe("platform roles", () => {
  it("support can look but not pay out; analysts can't change prices", () => {
    expect(can("support", "payments.view")).toBe(true);
    expect(can("support", "settlements.approve")).toBe(false);
    expect(can("analyst", "reports.export")).toBe(true);
    expect(can("analyst", "packages.edit")).toBe(false);
    expect(can("finance", "settlements.approve")).toBe(true);
    expect(can("finance", "admins.manage")).toBe(false);
    expect(can("technical", "health.view")).toBe(true);
    expect(can("technical", "reports.exportPersonal")).toBe(false);
  });

  it("role assignment needs the password and never removes the last owner", async () => {
    const u = await registerUser(db, { name: "Fin", email: `fin-${Date.now()}@sellnow.test`, password: "password123" });
    await expect(setAdminRole(db, owner.id, u.email, "finance", "bad")).rejects.toMatchObject({ code: "auth.stepUpFailed" });
    await setAdminRole(db, owner.id, u.email, "finance", "password123");
    expect((await db.query.platformAdmins.findFirst({ where: eq(platformAdmins.userId, u.id) }))?.role).toBe("finance");
    await expect(setAdminRole(db, owner.id, owner.email, "analyst", "password123")).rejects.toMatchObject({ code: "admin.lastOwner" });
  });
});

describe("packages & entitlements (backend-enforced)", () => {
  it("package limits come from the database and tenant overrides are audited", async () => {
    const s = await makeSeller(db);
    const plans = await listPlans(db);
    expect(plans.map((p) => p.id)).toEqual(["free", "launch", "growth", "enterprise"]);
    const free = plans.find((p) => p.id === "free")!;
    await savePlan(db, owner.id, { ...free, entitlements: { ...free.entitlements, maxProducts: 1 } });
    await createProduct(s.ctx, sambal);
    await expect(createProduct(s.ctx, { ...sambal, name: "Kedua" })).rejects.toMatchObject({ code: "products.limitReached" });
    await setOverride(db, owner.id, s.workspaceId, "maxProducts", 5, "Pilot customer agreement");
    await createProduct(s.ctx, { ...sambal, name: "Kedua" });
    expect((await entitlementsFor(db, s.workspaceId)).maxProducts).toBe(5);
    await savePlan(db, owner.id, { ...free, entitlements: { ...free.entitlements, maxProducts: 3 } });
  });

  it("plan prices are locked per tenant (grandfathering)", async () => {
    const s = await makeSeller(db);
    await setTenantPlan(db, owner.id, s.workspaceId, "launch", { reason: "Upgrade requested by owner", when: "now" });
    const launch = (await listPlans(db)).find((p) => p.id === "launch")!;
    await savePlan(db, owner.id, { ...launch, monthlySen: launch.monthlySen + 5000 });
    const { tenantSubscriptions } = await import("@/lib/db/schema");
    expect((await db.query.tenantSubscriptions.findFirst({ where: eq(tenantSubscriptions.workspaceId, s.workspaceId) }))?.priceSen).toBe(launch.monthlySen);
    expect((await overview(db)).kpi.paidTenants).toBeGreaterThanOrEqual(1);
  });

  it("a suspended tenant can't take orders", async () => {
    const s = await makeLiveStore(db);
    await suspendTenant(db, owner.id, s.workspaceId, "Fraud review in progress", "password123");
    expect((await entitlementsFor(db, s.workspaceId)).checkout).toBe(false);
    await expect(
      createCheckout(db, s.workspaceId, { idempotencyKey: newId("idem"), lines: [{ productId: s.productId, quantity: 1 }], customer: { name: "Pembeli", email: "b@example.com", phone: "0123456789", marketingConsent: false }, address: { line1: "No 1 Jalan", postcode: "43000", city: "Kajang", state: "Selangor" }, deliveryMethod: "shipping" }, { base: "http://x", slug: "x" }),
    ).rejects.toMatchObject({ code: "checkout.storeSuspended" });
    expect((await db.query.workspaces.findFirst({ where: eq(workspaces.id, s.workspaceId) }))?.suspendedReason).toBe("Fraud review in progress");
  });
});

describe("directory, detail and reports", () => {
  it("tenant search and detail never expose raw bank or ID numbers; reports mask personal data without permission", async () => {
    const s = await makeLiveStore(db);
    const list = await tenantDirectory(db, { q: (await db.query.workspaces.findFirst({ where: eq(workspaces.id, s.workspaceId) }))!.name });
    expect(list.some((t) => t.id === s.workspaceId)).toBe(true);
    const d = (await tenantDetail(db, s.workspaceId))!;
    expect(JSON.stringify(d)).not.toMatch(/Ciphertext/);
    const masked = await buildReport(db, { userId: owner.id, email: owner.email, canPersonal: false }, "tenants", {});
    expect(masked).toContain("# Personal data: masked");
    expect(masked).toMatch(/s\*\*\*@example\.com/);
    const full = await buildReport(db, { userId: owner.id, email: owner.email, canPersonal: true }, "tenants", {});
    expect(full).toContain("# Personal data: included");
    expect((await db.query.auditLogs.findMany({ where: eq(auditLogs.action, "admin.report.exported") })).length).toBeGreaterThanOrEqual(2);
    void products;
  });

  it("GMV is never counted as platform revenue", async () => {
    const o = await overview(db);
    expect(o.kpi.transactionRevenueSen).toBeLessThanOrEqual(o.kpi.gmvSen);
    expect(Object.keys(o.kpi)).toEqual(expect.arrayContaining(["gmvSen", "transactionRevenueSen", "mrrSen"]));
  });
});
