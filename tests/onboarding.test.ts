import { describe, it, expect, beforeAll, afterEach, vi } from "vitest";
import { eq } from "drizzle-orm";
import { makeDb, makeSeller, fakeProvider } from "./helpers";
import { makePdf, makeDocx, PNG_1PX, WEBM_AUDIO, MP4_VIDEO, file } from "./fixtures";
import type { DB } from "@/lib/db";
import { __setAIProviderForTests, AIProviderError } from "@/lib/ai/provider";
import { __setTranscriberForTests } from "@/lib/ai/transcribe";
import * as wz from "@/lib/onboarding/wizard";
import "@/lib/onboarding/research-job";
import "@/lib/website/generate-job";
import { sanitizeFacts, verifiedInCorpus } from "@/lib/onboarding/research-job";
import { enqueueJob, runJob, getJob, retryJob, needsKick } from "@/lib/jobs/runner";
import { achievementUnlocks, aiJobs, businessProfiles, businessProfileVersions, importedSources, products, storefronts, workspaces } from "@/lib/db/schema";
import { creditBalance } from "@/lib/billing/credits";

// Website research goes through the SSRF-safe client; tests replace only the network call.
const fetchMock = vi.hoisted(() => ({ impl: null as null | ((url: string) => Promise<{ finalUrl: string; status: number; contentType: string; body: string }>) }));
vi.mock("@/lib/ingest/safe-fetch", async (orig) => {
  const real = await orig<typeof import("@/lib/ingest/safe-fetch")>();
  return { ...real, safeFetch: (url: string) => (fetchMock.impl ? fetchMock.impl(url) : real.safeFetch(url)) };
});

let db: DB;
beforeAll(async () => {
  db = await makeDb();
});
afterEach(() => {
  __setAIProviderForTests(undefined);
  __setTranscriberForTests(null);
  fetchMock.impl = null;
});

const identifyOut = {
  category: "physical",
  confidence: 92,
  category_reason: "Food product in jars",
  clarification_question: null,
  products: [{ name: "Sambal Garing", description: "Homemade sambal", price: "19.90", source: "user" }],
  facts: [
    { field: "product_name", value: "Sambal Garing", source: "user" },
    { field: "price", value: "19.90", source: "user" },
    { field: "contact_phone", value: "0123456789", source: "extracted" }, // not in sources → must be dropped
  ],
  missing: ["fulfillment"],
};
const profileOut = {
  fields: [
    { field: "business_name", value: "Dapur Mak Teh", source: "ai_suggested" },
    { field: "tagline", value: "Pedas yang dirindui", source: "ai_suggested" },
    { field: "target_audience", value: "Pencinta makanan pedas", source: "ai_suggested" },
    { field: "price", value: "25.00", source: "ai_suggested" }, // invented price → dropped
    { field: "brand_primary", value: "#C2410C", source: "ai_suggested" },
  ],
  faq: [{ q: "Tahan berapa lama?", a: "Sila rujuk label." }],
  recommended_website: { type: "sales_page", reason: "One hero product" },
};
const copyOut = {
  seo_title: "Dapur Mak Teh",
  hero: { headline: "Sambal garing homemade", subheadline: "Dibuat setiap minggu", cta: "Beli sekarang" },
  benefits: [{ title: "Homemade", body: "Resipi keluarga" }],
  problem: "Sukar cari sambal sedap",
  solution: "Sambal Mak Teh",
  offer_title: "Tawaran",
  offer_body: "Beli 2",
  closing_headline: "Cuba hari ini",
  closing_cta: "Beli",
};
function aiAll() {
  return fakeProvider(({ system }) => (system.includes("business analyst") ? identifyOut : system.includes("business builder") ? profileOut : copyOut));
}

async function toProfile(s: Awaited<ReturnType<typeof makeSeller>>, idea: string, links: string[] = []) {
  const w = await wz.getOrCreateWizard(s.ctx);
  await wz.submitIdea(s.ctx, w.id, idea);
  const { job } = await wz.submitDetails(s.ctx, w.id, links, links.length === 0);
  const done = await runJob(db, job.id);
  return { w, job: done! };
}

describe("IDEA step inputs", () => {
  it("accepts text and resumes the same session (save & exit)", async () => {
    const s = await makeSeller(db);
    const w = await wz.getOrCreateWizard(s.ctx);
    await wz.saveIdeaText(s.ctx, w.id, "Saya nak jual sambal homemade");
    const again = await wz.getOrCreateWizard(s.ctx);
    expect(again.id).toBe(w.id);
    expect(again.ideaText).toBe("Saya nak jual sambal homemade");
    expect(again.stage).toBe("idea");
  });

  it("stores images and extracts text from PDF and DOCX", async () => {
    const s = await makeSeller(db);
    const w = await wz.getOrCreateWizard(s.ctx);
    const img = await wz.addFileInput(s.ctx, w.id, file(PNG_1PX, "jar.png", "image/png"));
    expect(img).toMatchObject({ kind: "image", status: "ready" });
    const pdf = await wz.addFileInput(s.ctx, w.id, file(makePdf("Sambal Garing RM19.90 per jar"), "menu.pdf", "application/pdf"));
    expect(pdf.status).toBe("ready");
    expect(pdf.text).toContain("Sambal Garing RM19.90");
    const docx = await wz.addFileInput(s.ctx, w.id, file(makeDocx("Kek lapis Sarawak 1kg"), "info.docx", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"));
    expect(docx.status).toBe("ready");
    expect(docx.text).toContain("Kek lapis Sarawak");
  });

  it("rejects video and unknown file types by content, not extension", async () => {
    const s = await makeSeller(db);
    const w = await wz.getOrCreateWizard(s.ctx);
    await expect(wz.addFileInput(s.ctx, w.id, file(MP4_VIDEO, "clip.mp4", "video/mp4"))).rejects.toMatchObject({ code: "wizard.videoNotSupported" });
    await expect(wz.addFileInput(s.ctx, w.id, file(Buffer.from("#!/bin/sh\nrm -rf /"), "fake.pdf", "application/pdf"))).rejects.toMatchObject({ code: "wizard.badFileType" });
  });

  it("transcribes voice notes when STT is configured, and lets the seller correct them", async () => {
    const s = await makeSeller(db);
    const w = await wz.getOrCreateWizard(s.ctx);
    __setTranscriberForTests(async () => "saya jual sambal sembilan belas ringgit");
    const v = await wz.addVoiceInput(s.ctx, w.id, file(WEBM_AUDIO, "voice.webm", "audio/webm"), 12);
    expect(v).toMatchObject({ kind: "voice", status: "ready", text: "saya jual sambal sembilan belas ringgit" });
    await wz.updateInputText(s.ctx, v.id, "Saya jual sambal RM19");
    const [edited] = await wz.listInputs(db, s.workspaceId, w.id);
    expect(edited).toMatchObject({ text: "Saya jual sambal RM19", textEdited: true });
  });

  it("keeps the recording but asks the seller to type when STT is not configured", async () => {
    const s = await makeSeller(db);
    const w = await wz.getOrCreateWizard(s.ctx);
    const v = await wz.addVoiceInput(s.ctx, w.id, file(WEBM_AUDIO, "voice.webm", "audio/webm"), 5);
    expect(v).toMatchObject({ status: "unsupported", error: "wizard.sttNotConfigured" });
    await expect(wz.addVoiceInput(s.ctx, w.id, file(MP4_VIDEO, "x.mp4", "video/mp4"), 5)).rejects.toMatchObject({ code: "wizard.badAudio" });
  });

  it("requires some input before continuing", async () => {
    const s = await makeSeller(db);
    const w = await wz.getOrCreateWizard(s.ctx);
    await expect(wz.submitIdea(s.ctx, w.id, "   ")).rejects.toMatchObject({ code: "onboarding.emptyInput" });
  });
});

describe("DETAILS research → PROFILE", () => {
  it("imports a public website and generates a profile with honest provenance", async () => {
    __setAIProviderForTests(aiAll());
    fetchMock.impl = async (url) => ({
      finalUrl: url,
      status: 200,
      contentType: "text/html",
      body: `<html><head><title>Dapur Mak Teh | Sambal</title><meta name="description" content="Sambal garing homemade dari Kelantan"></head><body>Harga RM19.90</body></html>`,
    });
    const s = await makeSeller(db);
    const before = await creditBalance(db, s.workspaceId);
    const { w, job } = await toProfile(s, "Saya nak jual sambal homemade RM19.90", ["dapurmakteh.my"]);
    expect(job.status).toBe("COMPLETED");
    expect(job.stages.map((x) => x.status)).toEqual(["done", "done", "done", "done"]);

    const [src] = await db.select().from(importedSources).where(eq(importedSources.sessionId, w.id));
    expect(src).toMatchObject({ status: "fetched", title: "Dapur Mak Teh | Sambal", platform: "website" });

    const p = (await db.query.businessProfiles.findFirst({ where: eq(businessProfiles.workspaceId, s.workspaceId) }))!;
    expect(p.fields.price).toMatchObject({ value: 1990, status: "user" }); // stated by seller, not the invented 25.00
    expect(p.fields.contact_phone).toBeUndefined(); // claimed "extracted" but nowhere in sources
    expect(p.fields.business_name).toMatchObject({ value: "Dapur Mak Teh", status: "ai_suggested" }); // model suggestion stays labelled as such
    expect(p.fields.tagline).toMatchObject({ status: "ai_suggested" });
    expect(p.fields.category).toMatchObject({ value: "physical", status: "ai_suggested" });
    expect((job.output.prepare_profile as { recommended: { type: string } }).recommended.type).toBe("sales_page");
    expect(await creditBalance(db, s.workspaceId)).toBe(before - 1 - 3);
  });

  it("does not scrape Facebook/TikTok and still lets onboarding proceed", async () => {
    __setAIProviderForTests(aiAll());
    fetchMock.impl = async () => {
      throw new Error("must not fetch social platforms");
    };
    const s = await makeSeller(db);
    const { w, job } = await toProfile(s, "Sambal homemade RM19.90", ["https://facebook.com/dapurmakteh", "https://www.tiktok.com/@dapurmakteh"]);
    expect(job.status).toBe("COMPLETED");
    const srcs = await db.select().from(importedSources).where(eq(importedSources.sessionId, w.id));
    expect(srcs.map((x) => [x.platform, x.status])).toEqual([
      ["facebook", "requires_connection"],
      ["tiktok", "requires_connection"],
    ]);
  });

  it("refuses private-network links (SSRF) instead of fetching them", async () => {
    const s = await makeSeller(db);
    const w = await wz.getOrCreateWizard(s.ctx);
    await wz.submitIdea(s.ctx, w.id, "sambal");
    await expect(wz.submitDetails(s.ctx, w.id, ["http://127.0.0.1:8080/admin"], false)).rejects.toMatchObject({ code: "wizard.invalidLinks" });
    await expect(wz.submitDetails(s.ctx, w.id, ["http://localhost/"], false)).rejects.toMatchObject({ code: "wizard.invalidLinks" });
  });

  it("does not auto-select a low-confidence category and asks one clarification", async () => {
    __setAIProviderForTests(
      fakeProvider(({ system }) =>
        system.includes("business analyst") ? { ...identifyOut, category: "service", confidence: 40, clarification_question: "Adakah anda menjual produk atau perkhidmatan?" } : profileOut,
      ),
    );
    const s = await makeSeller(db);
    const { w } = await toProfile(s, "Saya pandai buat sambal");
    const p = (await db.query.businessProfiles.findFirst({ where: eq(businessProfiles.workspaceId, s.workspaceId) }))!;
    expect(p.fields.category).toMatchObject({ status: "missing" });
    const sess = await wz.loadWizard(s.ctx, w.id);
    expect(sess.suggestedCategory).toBe("service");
    expect(sess.pendingQuestions[0]?.question).toContain("perkhidmatan");
    await expect(wz.approveProfile(s.ctx, w.id)).rejects.toMatchObject({ code: "onboarding.categoryRequired" });
  });

  it("fails cleanly, refunds credits, and can be retried", async () => {
    let fail = true;
    __setAIProviderForTests(fakeProvider(({ system }) => (fail && system.includes("business analyst") ? new AIProviderError("ai.authFailed", "bad key", false) : system.includes("business analyst") ? identifyOut : profileOut)));
    const s = await makeSeller(db);
    const before = await creditBalance(db, s.workspaceId);
    const { w, job } = await toProfile(s, "Sambal RM19.90");
    expect(job.status).toBe("FAILED");
    expect(job.error).toBe("ai.authFailed");
    expect(await creditBalance(db, s.workspaceId)).toBe(before);
    expect((await wz.loadWizard(s.ctx, w.id)).lastError).toBe("ai.authFailed");
    fail = false;
    const queued = await retryJob(db, s.workspaceId, job.id);
    expect(queued.stages.slice(0, 2).every((x) => x.status === "done")).toBe(true); // completed stages are kept
    expect((await runJob(db, job.id))!.status).toBe("COMPLETED");
  });

  it("builds a manual-mode profile from the seller's own material without AI", async () => {
    __setAIProviderForTests(null);
    const s = await makeSeller(db);
    const { job } = await toProfile(s, "Kek lapis Sarawak");
    expect(job.status).toBe("COMPLETED");
    const p = (await db.query.businessProfiles.findFirst({ where: eq(businessProfiles.workspaceId, s.workspaceId) }))!;
    expect(p.fields.description).toMatchObject({ value: "Kek lapis Sarawak", status: "user" });
    expect(p.fields.business_name).toMatchObject({ status: "missing" });
    expect(p.fields.category).toMatchObject({ status: "missing" });
    expect(Object.values(p.fields).some((f) => f.status === "ai_suggested")).toBe(false);
  });
});

describe("integrity rules", () => {
  it("verifies prices and phones against the seller's material", () => {
    const corpus = "harga rm19.90 sebotol. whatsapp 012-345 6789".toLowerCase();
    expect(verifiedInCorpus("price", "19.90", corpus)).toBe(true);
    expect(verifiedInCorpus("price", "25", corpus)).toBe(false);
    expect(verifiedInCorpus("contact_phone", "+60123456789", corpus)).toBe(true);
    const out = sanitizeFacts(
      [
        { field: "price", value: "19.90", source: "ai_suggested" },
        { field: "business_name", value: "Totally Invented Sdn Bhd", source: "user" },
      ],
      corpus,
    );
    expect(out).toEqual([{ field: "business_name", value: "Totally Invented Sdn Bhd", source: "ai_suggested" }]);
  });
});

describe("PROFILE → STORE → LAUNCH", () => {
  it("edits inline, approves into a versioned profile and product, generates the website and awards the sticker once", async () => {
    __setAIProviderForTests(aiAll());
    const s = await makeSeller(db);
    const { w } = await toProfile(s, "Saya jual sambal homemade RM19.90");
    await wz.updateProfileFields(s.ctx, { business_name: "Sambal Mak Teh", contact_email: "not-an-email" }).catch((e) => expect(e.code).toBe("onboarding.invalidFacts"));
    await wz.updateProfileFields(s.ctx, { business_name: "Sambal Mak Teh" });
    const approved = await wz.approveProfile(s.ctx, w.id);
    expect(approved.stage).toBe("store");
    const [ver] = await db.select().from(businessProfileVersions).where(eq(businessProfileVersions.workspaceId, s.workspaceId));
    expect(ver).toMatchObject({ category: "physical" });
    expect(ver!.fields.business_name).toMatchObject({ value: "Sambal Mak Teh", status: "confirmed" });
    const ws = await db.query.workspaces.findFirst({ where: eq(workspaces.id, s.workspaceId) });
    expect(ws).toMatchObject({ name: "Sambal Mak Teh", category: "physical" });
    const [prod] = await db.select().from(products).where(eq(products.workspaceId, s.workspaceId));
    expect(prod).toMatchObject({ name: "Sambal Garing", priceSen: 1990, status: "draft" });

    await expect(wz.chooseWebsiteType(s.ctx, w.id, "booking_page")).rejects.toMatchObject({ code: "wizard.websiteTypeIncompatible" });
    const { job } = await wz.chooseWebsiteType(s.ctx, w.id, "ecommerce");
    const dup = await enqueueJob(db, { workspaceId: s.workspaceId, userId: s.userId, kind: "website.generate", input: { websiteType: "ecommerce", locale: "ms" } });
    expect(dup).toMatchObject({ created: false, job: { id: job.id } }); // duplicate job prevention

    const done = (await runJob(db, job.id))!;
    expect(done.status).toBe("COMPLETED");
    expect(done.stages.map((x) => x.key)).toEqual(["understand", "brand", "structure", "content", "style", "components", "check", "ready"]);
    const sf = (await db.query.storefronts.findFirst({ where: eq(storefronts.workspaceId, s.workspaceId) }))!;
    expect(sf).toMatchObject({ status: "READY_FOR_REVIEW", websiteType: "ecommerce", publishedVersionId: null });
    expect(sf.draftContent.sections.map((x) => x.type)).toContain("catalog");
    expect(sf.draftTheme.preset).toBe("food");
    expect((await wz.loadWizard(s.ctx, w.id)).stage).toBe("done");

    // Regenerating does not award the setup sticker again.
    const again = await enqueueJob(db, { workspaceId: s.workspaceId, userId: s.userId, kind: "website.generate", input: { websiteType: "sales_page", locale: "ms" } });
    await runJob(db, again.job.id);
    const unlocks = await db.select().from(achievementUnlocks).where(eq(achievementUnlocks.workspaceId, s.workspaceId));
    expect(unlocks.filter((u) => u.key === "website_creator")).toHaveLength(1);
  });

  it("turns the products the AI found into drafts: verified prices only, seller's selection, plan limit, no duplicates", async () => {
    const flavours = {
      ...identifyOut,
      products: [
        { name: "Kek Lapis Horlicks", description: "1kg", price: "45", source: "user" },
        { name: "Kek Lapis Cheese", description: "1kg", price: "45", source: "user" },
        { name: "Kek Lapis Pandan", description: "1kg", price: "52", source: "user" }, // 52 never stated → dropped
        { name: "Kek Lapis Prune", description: "1kg", price: null, source: "user" },
      ],
      facts: [
        { field: "product_name", value: "Kek Lapis Horlicks", source: "user" },
        { field: "price", value: "45", source: "user" },
      ],
    };
    __setAIProviderForTests(fakeProvider(({ system }) => (system.includes("business analyst") ? flavours : profileOut)));
    const s = await makeSeller(db);
    const { w, job } = await toProfile(s, "Kek lapis Sarawak Horlicks, Cheese, Pandan dan Prune. RM45 sebiji.");
    const found = (job.output.prepare_profile as { products: { name: string; priceSen: number | null }[] }).products;
    expect(found).toEqual([
      { name: "Kek Lapis Horlicks", description: "1kg", priceSen: 4500 },
      { name: "Kek Lapis Cheese", description: "1kg", priceSen: 4500 },
      { name: "Kek Lapis Pandan", description: "1kg", priceSen: null },
      { name: "Kek Lapis Prune", description: "1kg", priceSen: null },
    ]);
    await wz.updateProfileFields(s.ctx, { business_name: "Kek Lapis Mak Nab" });
    // The client may only pick names from the server's list; an injected product is ignored.
    await wz.approveProfile(s.ctx, w.id, ["Kek Lapis Cheese", "kek lapis pandan", "Kek Lapis Prune", "Free iPhone"]);
    const list = await db.select().from(products).where(eq(products.workspaceId, s.workspaceId));
    // Free plan = 3 products: main + the first two selections; the 4th is skipped at the limit.
    expect(list.map((x) => [x.name, x.priceSen, x.status]).sort()).toEqual([
      ["Kek Lapis Cheese", 4500, "draft"],
      ["Kek Lapis Horlicks", 4500, "draft"],
      ["Kek Lapis Pandan", 0, "draft"],
    ]);
    expect(list.every((x) => x.attributes.fulfillment === "shipping")).toBe(true);
    // Going back and approving again never duplicates.
    await wz.goToStage(s.ctx, w.id, "profile");
    await wz.approveProfile(s.ctx, w.id, ["Kek Lapis Cheese", "Kek Lapis Pandan"]);
    expect(await db.select().from(products).where(eq(products.workspaceId, s.workspaceId))).toHaveLength(3);
  });

  it("resumes a job whose worker died, skipping completed stages", async () => {
    __setAIProviderForTests(null);
    const s = await makeSeller(db);
    const { w } = await toProfile(s, "Kelas memasak");
    await wz.updateProfileFields(s.ctx, { business_name: "Kelas Mak Teh", product_name: "Kelas Rendang" }, undefined, "event");
    await wz.approveProfile(s.ctx, w.id);
    const { job } = await wz.chooseWebsiteType(s.ctx, w.id, "event_registration");
    // Simulate a crash after two stages: PROCESSING with an expired lease.
    await db
      .update(aiJobs)
      .set({
        status: "PROCESSING",
        attempts: 1,
        leaseUntil: new Date(Date.now() - 1000),
        stages: job.stages.map((x, i) => ({ ...x, status: i < 2 ? "done" : "pending" })),
        output: { understand: { category: "event" }, brand: { preset: "events", theme: { primary: "#7C3AED", accent: "#F472B6", background: "#FCFAFF", text: "#1A1033", preset: "events" } } },
      })
      .where(eq(aiJobs.id, job.id));
    const stale = (await getJob(db, s.workspaceId, job.id))!;
    expect(needsKick(stale)).toBe(true);
    const [a, b] = await Promise.all([runJob(db, job.id), runJob(db, job.id)]); // two pollers race
    expect([a, b].filter(Boolean)).toHaveLength(1);
    const final = (await getJob(db, s.workspaceId, job.id))!;
    expect(final.status).toBe("COMPLETED");
    const sf = (await db.query.storefronts.findFirst({ where: eq(storefronts.workspaceId, s.workspaceId) }))!;
    expect(sf.draftTheme.preset).toBe("events");
    expect(sf.draftContent.salesMode).toBe("enquiry"); // event checkout is not built → interest capture, no fake tickets
    expect(sf.draftContent.sections.find((x) => x.type === "contact")?.props.mode).toBe("interest");
  });

  it("allows going back but not skipping ahead", async () => {
    const s = await makeSeller(db);
    const w = await wz.getOrCreateWizard(s.ctx);
    await expect(wz.goToStage(s.ctx, w.id, "store")).rejects.toMatchObject({ code: "onboarding.wrongStep" });
    await wz.submitIdea(s.ctx, w.id, "sambal");
    expect((await wz.goToStage(s.ctx, w.id, "idea")).stage).toBe("idea");
  });
});
