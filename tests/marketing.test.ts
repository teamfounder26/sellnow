import { describe, it, expect, beforeAll, afterEach } from "vitest";
import { eq } from "drizzle-orm";
import { makeDb, makeSeller, makeLiveStore, fakeProvider, sambal } from "./helpers";
import type { DB } from "@/lib/db";
import { createCampaignDraft, approveCampaign, publishCampaign, updateCampaignBudget, generateTextCreative } from "@/lib/marketing/service";
import { campaigns, notifications, creatives } from "@/lib/db/schema";
import { __setAIProviderForTests } from "@/lib/ai/provider";
import { createProduct, updateProduct } from "@/lib/products/service";
import { captureLead, listLeads } from "@/lib/crm/service";

let db: DB;
beforeAll(async () => {
  db = await makeDb();
});
afterEach(() => __setAIProviderForTests(undefined));

const draft = (productId: string) => ({ name: "Kempen Raya", productId, objective: "sales" as const, audience: { location: "Malaysia", ageMin: 25, ageMax: 45, interests: "makanan" }, dailyBudget: "20.00", durationDays: 7 });

describe("campaign approval & spending safety", () => {
  it("requires approval before publishing and never fakes provider success", async () => {
    const s = await makeSeller(db);
    const pid = await createProduct(s.ctx, { ...sambal, status: "draft" });
    const id = await createCampaignDraft(db, s, draft(pid));
    await expect(publishCampaign(db, s, id)).rejects.toMatchObject({ code: "marketing.approvalRequired" });
    await approveCampaign(db, s, id);
    // Approved, but no Meta account is connected: refuse rather than simulate a launch.
    await expect(publishCampaign(db, s, id)).rejects.toMatchObject({ code: "marketing.metaNotConnected" });
    const c = await db.query.campaigns.findFirst({ where: eq(campaigns.id, id) });
    expect(c?.status).toBe("approved");
    expect(c?.externalId).toBeNull();
  });

  it("clears approval whenever the budget changes", async () => {
    const s = await makeSeller(db);
    const pid = await createProduct(s.ctx, { ...sambal, status: "draft" });
    const id = await createCampaignDraft(db, s, draft(pid));
    await approveCampaign(db, s, id);
    await updateCampaignBudget(db, s, id, "50.00");
    const c = await db.query.campaigns.findFirst({ where: eq(campaigns.id, id) });
    expect(c).toMatchObject({ status: "draft", approvedBudgetSen: null, dailyBudgetSen: 5000 });
    await expect(publishCampaign(db, s, id)).rejects.toMatchObject({ code: "marketing.approvalRequired" });
  });

  it("rejects budgets under the minimum", async () => {
    const s = await makeSeller(db);
    const pid = await createProduct(s.ctx, { ...sambal, status: "draft" });
    await expect(createCampaignDraft(db, s, { ...draft(pid), dailyBudget: "1.00" })).rejects.toBeTruthy();
  });
});

describe("creative studio + context engine", () => {
  it("stores generated copy with a price snapshot and flags it when the price changes", async () => {
    __setAIProviderForTests(fakeProvider(() => ({ variants: [{ headline: "Pedas!", primary_text: "Sambal RM19.90", call_to_action: "Beli", hashtags: ["sambal"] }], notes: "" })));
    const s = await makeSeller(db);
    const pid = await createProduct(s.ctx, { ...sambal, status: "draft" });
    const cid = await generateTextCreative(s.ctx, { productId: pid, type: "ad_copy", objective: "offer", style: "friendly" });
    const cr = await db.query.creatives.findFirst({ where: eq(creatives.id, cid) });
    expect(cr?.priceSnapshotSen).toBe(1990);
    await updateProduct(s.ctx, pid, { ...sambal, status: "draft", price: "22.00" });
    const n = await db.query.notifications.findMany({ where: eq(notifications.workspaceId, s.workspaceId) });
    const alert = n.find((x) => x.type === "context.price_changed");
    expect(alert).toBeTruthy();
    expect((alert!.data as { items: { kind: string }[] }).items.map((i) => i.kind)).toContain("creative");
  });

  it("refuses creative generation when AI is not configured", async () => {
    __setAIProviderForTests(null);
    const s = await makeSeller(db);
    const pid = await createProduct(s.ctx, { ...sambal, status: "draft" });
    await expect(generateTextCreative(s.ctx, { productId: pid, type: "ad_copy", objective: "offer", style: "friendly" })).rejects.toMatchObject({ code: "ai.notConfigured" });
  });
});

describe("lead capture", () => {
  it("persists enquiries per workspace", async () => {
    const s = await makeLiveStore(db, { type: "service", name: "Reka Logo", price: "150.00", serviceScope: "1 logo, 2 revisi", status: "active" });
    await captureLead(db, s.workspaceId, { name: "Ali", email: "ali@example.com", message: "Nak logo kedai", productId: s.productId, consent: true });
    const other = await makeSeller(db);
    expect(await listLeads(db, s.workspaceId)).toHaveLength(1);
    expect(await listLeads(db, other.workspaceId)).toHaveLength(0);
    await expect(captureLead(db, other.workspaceId, { name: "Xavier", email: "x@example.com", productId: s.productId })).rejects.toMatchObject({ code: "errors.notFound" });
  });
});
