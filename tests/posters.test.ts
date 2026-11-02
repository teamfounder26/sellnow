import { describe, it, expect, beforeAll, afterEach } from "vitest";
import { and, eq } from "drizzle-orm";
import { makeDb, makeLiveStore, makeSeller, fakeProvider } from "./helpers";
import type { DB } from "@/lib/db";
import { adSlotLedger, ads, aiCreditLedger, posterVersions, posters, type PosterBrief } from "@/lib/db/schema";
import { __setAIProviderForTests } from "@/lib/ai/provider";
import { __setImageGeneratorForTests } from "@/lib/ai/image";
import { creditBalance } from "@/lib/billing/credits";
import { CREDIT_COSTS } from "@/lib/billing/plans";
import { createProduct } from "@/lib/products/service";
import { DEFAULT_SETTINGS } from "@/lib/posters/options";
import { compilePrompts, THEME_RULES } from "@/lib/posters/prompt";
import * as svc from "@/lib/posters/service";
import { enqueueJob, runJob } from "@/lib/jobs/runner";
import "@/lib/jobs/registry";
import { posterProjects } from "@/lib/db/schema";
import { publishStorefront } from "@/lib/storefront/service";

async function liveStore() {
  const s = await makeLiveStore(db);
  expect((await publishStorefront(s.ctx)).ok).toBe(true);
  return s;
}

let db: DB;
beforeAll(async () => {
  db = await makeDb();
});
afterEach(() => {
  __setAIProviderForTests(undefined);
  __setImageGeneratorForTests(null);
});

// A real 1×1 PNG so storage's magic-byte check passes.
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==", "base64");

function aiBrief(themes: string[], extra: Partial<{ testimonial_index: number }> = {}) {
  return {
    intel: { what: "Sambal goreng garing", who: "Pencinta pedas", problem: "Lauk cepat", solution: "Sambal siap makan", benefits: ["Homemade"], usp: "Resipi Mak Teh", evidence: ["description: Sambal homemade 200g"], assumptions: ["Sesuai untuk pelajar"], questions: [] },
    audience: { customer: "Pekerja sibuk", problem: "Tiada masa masak", motivation: "Makan sedap cepat" },
    objective: "sales",
    recommendation: "Uji poster USP dan Features untuk lihat mesej mana lebih berkesan.",
    main_benefit: "Sambal homemade siap makan",
    claims: [],
    concepts: themes.map((t, i) => ({
      theme: t,
      angle: "benefits",
      style: "fluent_3d",
      key_message: `Mesej ${i}`,
      headline: `Sambal Garing Sedap Setiap Hari ${i}`,
      body: ["Homemade 200g", "Siap makan", "Pedas berpada"],
      cta: "Beli Sekarang",
      hero: "Balang sambal",
      supporting: ["balang", "nasi", "cili"],
      layout: "hero tengah",
      colors: ["#1F83D8"],
      testimonial_index: extra.testimonial_index ?? -1,
    })),
  };
}

describe("prompt compiler", () => {
  const brief: PosterBrief = {
    product: { name: "Sambal", priceSen: 1990, mainBenefit: "Homemade" },
    audience: { customer: "Pekerja", problem: "Sibuk", motivation: "Cepat" },
    strategy: { objective: "sales", recommendation: "" },
    concepts: [],
    evidence: { facts: [], claims: [], testimonials: [{ quote: "Sedap gila!", author: "Aina" }] },
    sources: {},
  };
  const c = { theme: "testimonial" as const, angle: "benefits" as const, keyMessage: "x", copy: { headline: "Pelanggan Suka Sambal Ini", body: ["Homemade"], cta: "Beli Sekarang" }, visual: { style: "flat" as const, hero: "balang", supporting: ["balang"], layout: "kad ulasan", colors: [] }, testimonialIndex: 0 };
  it("full prompt carries the exact approved text, theme, ratio, colours and negatives", () => {
    const { prompt, artPrompt } = compilePrompts(brief, c, { ratio: "3:4", brandColors: ["#1F83D8"], showPrice: true, priceLabel: "RM19.90" });
    expect(prompt).toContain('HEADLINE: "Pelanggan Suka Sambal Ini"');
    expect(prompt).toContain('CTA BUTTON: "Beli Sekarang"');
    expect(prompt).toContain('"Sedap gila!" — Aina');
    expect(prompt).toContain("1200×1600");
    expect(prompt).toContain("#1F83D8");
    expect(prompt).toContain("RM19.90");
    expect(prompt).toContain("AVOID:");
    expect(prompt).toContain(THEME_RULES.testimonial.structure);
    // The artwork prompt never asks the model to draw words — SellNow overlays them exactly.
    expect(artPrompt).toContain("DO NOT render any words");
    expect(artPrompt).not.toContain("Pelanggan Suka Sambal Ini");
  });
});

describe("AI Poster Studio flow", () => {
  it("rules mode (no AI): facts come from the product, brief is editable, nothing is charged", async () => {
    __setAIProviderForTests(null);
    const s = await makeSeller(db);
    const productId = await createProduct(s.ctx, { type: "physical", name: "Kek Batik Premium", description: "Kek batik coklat Belgium. Tahan 5 hari.", price: "35.00", fulfillment: "shipping", shippingFlat: "8.00", trackStock: false, stock: "", status: "active" });
    const before = await creditBalance(db, s.workspaceId);
    const id = await svc.createProject(s.ctx, { productId, settings: { ...DEFAULT_SETTINGS, theme: "features" } });
    const pr = await svc.getProject(db, s.workspaceId, id);
    expect(pr.briefBy).toBe("rules");
    expect(pr.intel.facts.find((f) => f.label === "price")).toMatchObject({ value: "RM35.00", source: "product" });
    expect(pr.brief.concepts[0]!.theme).toBe("features");
    expect(pr.brief.concepts[0]!.copy.body).toEqual(["Kek batik coklat Belgium.", "Tahan 5 hari."]);
    expect(pr.brief.strategy.objective).toBe("awareness"); // no live store → no Sales/Traffic
    expect(await creditBalance(db, s.workspaceId)).toBe(before);
  });

  it("testimonial theme is refused without verified testimonials (never fabricated)", async () => {
    __setAIProviderForTests(null);
    const s = await makeLiveStore(db);
    await expect(svc.createProject(s.ctx, { productId: s.productId, settings: { ...DEFAULT_SETTINGS, theme: "testimonial" } })).rejects.toMatchObject({ code: "posters.noTestimonials" });
    // A seller-provided testimonial counts only with the permission confirmation.
    const ok = await svc.createProject(s.ctx, { productId: s.productId, settings: { ...DEFAULT_SETTINGS, theme: "testimonial", advanced: { testimonial: { quote: "Rangup dan sedap!", author: "Kak Ros", permission: true } } } });
    const pr = await svc.getProject(db, s.workspaceId, ok);
    expect(pr.brief.evidence.testimonials).toEqual([{ quote: "Rangup dan sedap!", author: "Kak Ros" }]);
    expect(pr.brief.concepts[0]).toMatchObject({ theme: "testimonial", testimonialIndex: 0 });
  });

  it("AI brief: enforces seller choices, distinct variations, removes fake testimonial themes; charges brief credits once", async () => {
    const s = await liveStore();
    let system = "";
    __setAIProviderForTests(fakeProvider((r) => ((system = r.system), aiBrief(["usp", "testimonial", "features"]))));
    const before = await creditBalance(db, s.workspaceId);
    const id = await svc.createProject(s.ctx, { productId: s.productId, settings: { ...DEFAULT_SETTINGS, variations: 3, style: "chibi" } });
    const pr = await svc.getProject(db, s.workspaceId, id);
    expect(await creditBalance(db, s.workspaceId)).toBe(before - CREDIT_COSTS["poster.brief"]);
    expect(pr.brief.concepts.map((c) => c.theme)).toEqual(["usp", "usp", "features"]); // no testimonials → never "testimonial"
    expect(pr.brief.concepts.every((c) => c.visual.style === "chibi")).toBe(true);
    expect(pr.brief.strategy.objective).toBe("sales"); // live checkout available
    expect(pr.intel.assumptions).toEqual(["Sesuai untuk pelajar"]);
    expect(pr.brief.sources["concepts"]).toBe("ai");
    expect(system).toContain("Never invent benefits");
    expect(system).toContain('never use the "testimonial" theme');
  });

  it("approval is required before images; edits after approval require re-approval; prompts cost nothing", async () => {
    const s = await makeLiveStore(db);
    __setAIProviderForTests(fakeProvider(() => aiBrief(["usp"])));
    const id = await svc.createProject(s.ctx, { productId: s.productId, settings: DEFAULT_SETTINGS });
    const credits = await creditBalance(db, s.workspaceId);
    // No posters (and no image generation) before approval.
    expect(await db.query.posters.findMany({ where: eq(posters.projectId, id) })).toHaveLength(0);
    await svc.approveBrief(s.ctx, id);
    const [p] = await db.query.posters.findMany({ where: eq(posters.projectId, id) });
    expect(p!.prompt).toContain('HEADLINE: "Sambal Garing Sedap Setiap Hari 0"');
    expect(await creditBalance(db, s.workspaceId)).toBe(credits);

    const pr = await svc.getProject(db, s.workspaceId, id);
    const edited = structuredClone(pr.brief);
    edited.concepts[0]!.copy.headline = "Sambal Rangup Tanpa Pengawet";
    edited.product.priceSen = 1; // locked facts are ignored
    await svc.updateBrief(s.ctx, id, edited);
    const after = await svc.getProject(db, s.workspaceId, id);
    expect(after.status).toBe("brief");
    expect(after.brief.product.priceSen).toBe(1990);
    expect(after.brief.sources["concepts.0"]).toBe("user");
    await expect(svc.generateVersion(s.ctx, p!.id, { kind: "layout", requestKey: "req-layout-1" })).rejects.toMatchObject({ code: "posters.notApproved" });
    await svc.approveBrief(s.ctx, id);
    expect((await db.query.posters.findFirst({ where: eq(posters.id, p!.id) }))!.copy.headline).toBe("Sambal Rangup Tanpa Pengawet");

    // An incomplete brief can't be approved.
    const bad = structuredClone(after.brief);
    bad.concepts[0]!.copy.body = ["satu"];
    await svc.updateBrief(s.ctx, id, bad);
    await expect(svc.approveBrief(s.ctx, id)).rejects.toMatchObject({ code: "posters.briefIncomplete" });
  });

  it("image generation: charged once per request key, refunded on failure, versions preserved, text edits re-use artwork", async () => {
    const s = await makeLiveStore(db);
    __setAIProviderForTests(fakeProvider(() => aiBrief(["features"])));
    const id = await svc.createProject(s.ctx, { productId: s.productId, settings: DEFAULT_SETTINGS });
    await svc.approveBrief(s.ctx, id);
    const [p] = await db.query.posters.findMany({ where: eq(posters.projectId, id) });

    // Not configured → clear error, nothing charged.
    const c0 = await creditBalance(db, s.workspaceId);
    await expect(svc.generateVersion(s.ctx, p!.id, { kind: "ai_image", requestKey: "req-noprov-1" })).rejects.toMatchObject({ code: "posters.imageProviderMissing" });
    expect(await creditBalance(db, s.workspaceId)).toBe(c0);

    let prompts: string[] = [];
    __setImageGeneratorForTests(async (r) => ((prompts = [...prompts, r.prompt]), { bytes: PNG, mime: "image/png", model: "img-test" }));
    const v1 = await svc.generateVersion(s.ctx, p!.id, { kind: "ai_image", requestKey: "req-image-1" });
    const again = await svc.generateVersion(s.ctx, p!.id, { kind: "ai_image", requestKey: "req-image-1" }); // double click
    expect(again.id).toBe(v1.id);
    expect(v1).toMatchObject({ status: "succeeded", kind: "ai_image", textMode: "overlay", credits: CREDIT_COSTS["poster.image"] });
    expect(prompts).toHaveLength(1);
    expect(prompts[0]).toContain("DO NOT render any words");
    expect(await creditBalance(db, s.workspaceId)).toBe(c0 - CREDIT_COSTS["poster.image"]);

    // Provider failure → version failed, credits refunded, the previous version stays current.
    __setImageGeneratorForTests(async () => {
      throw new (await import("@/lib/ai/provider")).AIProviderError("ai.refused", "safety", false);
    });
    await expect(svc.generateVersion(s.ctx, p!.id, { kind: "ai_image", requestKey: "req-image-2" })).rejects.toMatchObject({ code: "ai.refused" });
    expect(await creditBalance(db, s.workspaceId)).toBe(c0 - CREDIT_COSTS["poster.image"]);
    const after = await db.query.posters.findFirst({ where: eq(posters.id, p!.id) });
    expect(after!.currentVersionId).toBe(v1.id);
    const refunds = await db.query.aiCreditLedger.findMany({ where: and(eq(aiCreditLedger.workspaceId, s.workspaceId), eq(aiCreditLedger.reason, "refund_failed_generation")) });
    expect(refunds).toHaveLength(1);

    // Text edit on overlay artwork → free new version with the same art; old versions kept.
    const r = await svc.editCopy(s.ctx, p!.id, { headline: "Sambal Baru Lebih Rangup", body: ["Homemade 200g", "Siap makan"], cta: "Beli Sekarang" });
    expect(r.needsRegeneration).toBe(false);
    const all = await db.query.posterVersions.findMany({ where: eq(posterVersions.posterId, p!.id) });
    expect(all.map((v) => v.status).sort()).toEqual(["failed", "succeeded", "succeeded"]);
    const v3 = all.find((v) => v.id === r.versionId)!;
    expect(v3).toMatchObject({ artAssetId: v1.artAssetId, credits: 0 });
    expect(v3.copy.headline).toBe("Sambal Baru Lebih Rangup");

    // In-image text can't be edited in place — it must be regenerated.
    __setImageGeneratorForTests(async () => ({ bytes: PNG, mime: "image/png", model: "img-test" }));
    await svc.generateVersion(s.ctx, p!.id, { kind: "ai_image", textMode: "in_image", requestKey: "req-image-3" });
    expect((await svc.editCopy(s.ctx, p!.id, { headline: "Lain", body: ["a", "b"], cta: "Beli" })).needsRegeneration).toBe(true);
  });

  it("layout posters, Save to library, Use in Meta Ads: no ad slot is consumed by creative work", async () => {
    const s = await liveStore();
    __setAIProviderForTests(fakeProvider(() => aiBrief(["usp", "features", "educate", "usp", "features"])));
    const id = await svc.createProject(s.ctx, { productId: s.productId, settings: { ...DEFAULT_SETTINGS, variations: 5 } });
    await svc.approveBrief(s.ctx, id);
    const list = await db.query.posters.findMany({ where: eq(posters.projectId, id) });
    expect(list).toHaveLength(5);
    const credits = await creditBalance(db, s.workspaceId);
    for (const [i, p] of list.entries()) await svc.generateVersion(s.ctx, p.id, { kind: "layout", requestKey: `req-layout-${i}-x` });
    expect(await creditBalance(db, s.workspaceId)).toBe(credits);

    const p0 = (await db.query.posters.findFirst({ where: eq(posters.id, list[0]!.id) }))!;
    await expect(svc.useInAds(s.ctx, p0.id, "http://localhost:3100")).rejects.toMatchObject({ code: "posters.saveFirst" });
    await svc.saveRender(s.ctx, p0.currentVersionId!, PNG);
    const adId = await svc.useInAds(s.ctx, p0.id, "http://localhost:3100");
    const ad = await db.query.ads.findFirst({ where: eq(ads.id, adId) });
    expect(ad).toMatchObject({ status: "draft", productId: s.productId });
    expect(ad!.creative).toMatchObject({ headline: p0.copy.headline, cta: "shop_now", ratio: "3:4" });
    expect(ad!.creative!.imageAssetId).toBeTruthy();
    expect(await db.query.adSlotLedger.findMany({ where: eq(adSlotLedger.workspaceId, s.workspaceId) })).toHaveLength(0);

    const lib = await svc.libraryView(db, s.workspaceId);
    expect(lib).toHaveLength(5);
    expect(lib.find((r) => r.poster.id === p0.id)).toMatchObject({ status: "approved", versionCount: 1, ad: { id: adId } });
    expect(await svc.libraryView(db, s.workspaceId, { theme: "educate" })).toHaveLength(1);

    const dup = await svc.duplicatePoster(s.ctx, p0.id);
    const dv = await db.query.posterVersions.findMany({ where: eq(posterVersions.posterId, dup) });
    expect(dv).toHaveLength(1);
    expect(dv[0]!.imageAssetId).toBeNull();
  });

  it("tenant isolation: another workspace can't read or generate", async () => {
    const s = await makeLiveStore(db);
    __setAIProviderForTests(fakeProvider(() => aiBrief(["usp"])));
    const id = await svc.createProject(s.ctx, { productId: s.productId, settings: DEFAULT_SETTINGS });
    const other = await makeSeller(db);
    await expect(svc.getProject(db, other.workspaceId, id)).rejects.toMatchObject({ code: "errors.notFound" });
    await expect(svc.createProject(other.ctx, { productId: s.productId, settings: DEFAULT_SETTINGS })).rejects.toMatchObject({ code: "errors.notFound" });
  });

  it("brief job: runs in the background, creates the project exactly once, validation fails fast", async () => {
    const s = await liveStore();
    __setAIProviderForTests(fakeProvider(() => aiBrief(["usp"])));
    await expect(svc.validateBriefRequest(s.ctx, { productId: s.productId, settings: { ...DEFAULT_SETTINGS, theme: "testimonial" } })).rejects.toMatchObject({ code: "posters.noTestimonials" });
    const projectId = "ppj_jobtest0001";
    const { job } = await enqueueJob(db, { workspaceId: s.workspaceId, userId: s.userId, kind: "poster.brief", input: { mode: "create", projectId, productId: s.productId, settings: DEFAULT_SETTINGS, locale: "ms" } });
    const again = await enqueueJob(db, { workspaceId: s.workspaceId, userId: s.userId, kind: "poster.brief", input: { mode: "create", projectId: "ppj_other", productId: s.productId, settings: DEFAULT_SETTINGS, locale: "ms" } });
    expect(again).toMatchObject({ created: false, job: { id: job.id } }); // double click → same job
    expect((await runJob(db, job.id))!.status).toBe("COMPLETED");
    // A resumed stage with the same id doesn't create a second project.
    await svc.createProject(s.ctx, { id: projectId, productId: s.productId, settings: DEFAULT_SETTINGS });
    expect(await db.query.posterProjects.findMany({ where: eq(posterProjects.workspaceId, s.workspaceId) })).toHaveLength(1);
  });
});
