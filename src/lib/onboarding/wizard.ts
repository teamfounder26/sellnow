import { and, asc, desc, eq, inArray } from "drizzle-orm";
import type { DB } from "@/lib/db";
import {
  assets,
  businessProfiles,
  businessProfileVersions,
  importedSources,
  onboardingInputs,
  onboardingSessions,
  products,
  workspaces,
  type OnboardingLink,
  type OnboardingStage,
  type ProfileField,
} from "@/lib/db/schema";
import { newId } from "@/lib/ids";
import { AppError } from "@/lib/errors";
import { isCategory, type Category } from "@/lib/categories";
import { isAIConfigured, AIProviderError, type AIImage } from "@/lib/ai/provider";
import { transcribeAudio, transcriptionConfigured } from "@/lib/ai/transcribe";
import { parseRinggitToSen } from "@/lib/money";
import { detectImageMime, IMAGE_LIMIT, readAssetBytes, storeAsset, storeBytes, detectAudioMime, VOICE_LIMIT } from "@/lib/storage";
import { DOCUMENT_LIMIT, detectDocument, extractDocumentText } from "@/lib/ingest/documents";
import { normalizeLink } from "@/lib/ingest/links";
import { audit, track } from "@/lib/audit";
import { createProduct, updateProduct } from "@/lib/products/service";
import { enqueueJob, getActiveJob, getJob, type Job } from "@/lib/jobs/runner";

export type Ctx = { db: DB; workspaceId: string; userId: string; locale: "ms" | "en" };
export type WizardSession = typeof onboardingSessions.$inferSelect;
export type WizardInput = typeof onboardingInputs.$inferSelect;

export const STAGES: OnboardingStage[] = ["idea", "details", "profile", "store", "launch"];
export const MAX_INPUTS = 8;
export const MAX_LINKS = 5;
/** Documents up to this size are read immediately; larger ones are read inside the research job. */
const INLINE_EXTRACT_LIMIT = 3 * 1024 * 1024;
export const CATEGORY_CONFIDENCE_THRESHOLD = 70;

// ---------------------------------------------------------------- session
export async function getOrCreateWizard(ctx: Ctx): Promise<WizardSession> {
  const existing = await ctx.db.query.onboardingSessions.findFirst({
    where: eq(onboardingSessions.workspaceId, ctx.workspaceId),
    orderBy: desc(onboardingSessions.createdAt),
  });
  if (existing) return existing;
  const [row] = await ctx.db
    .insert(onboardingSessions)
    .values({ id: newId("onb"), workspaceId: ctx.workspaceId, userId: ctx.userId, mode: (await isAIConfigured()) ? "ai" : "manual" })
    .returning();
  await track(ctx.db, "onboarding_started", { workspaceId: ctx.workspaceId, userId: ctx.userId });
  return row!;
}

export async function loadWizard(ctx: Ctx, sessionId: string) {
  const s = await ctx.db.query.onboardingSessions.findFirst({
    where: and(eq(onboardingSessions.id, sessionId), eq(onboardingSessions.workspaceId, ctx.workspaceId)),
  });
  if (!s) throw new AppError("errors.notFound");
  return s;
}

async function savePatch(ctx: Ctx, s: WizardSession, patch: Partial<typeof onboardingSessions.$inferInsert>) {
  const [row] = await ctx.db
    .update(onboardingSessions)
    .set({ ...patch, updatedAt: new Date() })
    .where(and(eq(onboardingSessions.id, s.id), eq(onboardingSessions.workspaceId, ctx.workspaceId)))
    .returning();
  return row!;
}

/** Back navigation to any earlier stage is always allowed; forward moves go through the step actions. */
export async function goToStage(ctx: Ctx, sessionId: string, stage: OnboardingStage) {
  const s = await loadWizard(ctx, sessionId);
  const from = STAGES.indexOf(s.stage === "done" ? "launch" : s.stage);
  if (STAGES.indexOf(stage) > from) throw new AppError("onboarding.wrongStep");
  return savePatch(ctx, s, { stage });
}

// ---------------------------------------------------------------- IDEA
export async function saveIdeaText(ctx: Ctx, sessionId: string, text: string) {
  const s = await loadWizard(ctx, sessionId);
  return savePatch(ctx, s, { ideaText: text.slice(0, 4000) });
}

export async function listInputs(db: DB, workspaceId: string, sessionId: string) {
  return db.query.onboardingInputs.findMany({
    where: and(eq(onboardingInputs.sessionId, sessionId), eq(onboardingInputs.workspaceId, workspaceId)),
    orderBy: asc(onboardingInputs.createdAt),
  });
}

async function countInputs(ctx: Ctx, sessionId: string) {
  return (await listInputs(ctx.db, ctx.workspaceId, sessionId)).length;
}

/** Image or document upload. Type is detected from content; video and anything else is refused. */
export async function addFileInput(ctx: Ctx, sessionId: string, file: File): Promise<WizardInput> {
  await loadWizard(ctx, sessionId);
  if ((await countInputs(ctx, sessionId)) >= MAX_INPUTS) throw new AppError("wizard.tooManyFiles", { max: MAX_INPUTS });
  if (file.type.startsWith("video/") || /\.(mp4|mov|avi|mkv|webm|m4v|3gp)$/i.test(file.name)) throw new AppError("wizard.videoNotSupported");
  const buf = Buffer.from(await file.arrayBuffer());

  if (detectImageMime(buf)) {
    if (buf.length > IMAGE_LIMIT) throw new AppError("upload.tooLarge", { mb: 5 });
    const a = await storeAsset(ctx.db, { workspaceId: ctx.workspaceId, file, kind: "image" });
    const [row] = await ctx.db
      .insert(onboardingInputs)
      .values({ id: newId("inp"), workspaceId: ctx.workspaceId, sessionId, kind: "image", assetId: a.id, status: "ready", meta: { name: file.name.slice(0, 120), size: buf.length } })
      .returning();
    return row!;
  }

  const kind = detectDocument(buf, file.name);
  if (!kind) throw new AppError("wizard.badFileType");
  if (buf.length > DOCUMENT_LIMIT) throw new AppError("upload.tooLarge", { mb: 10 });
  const mime = { pdf: "application/pdf", docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", doc: "application/msword" }[kind];
  const a = await storeBytes(ctx.db, { workspaceId: ctx.workspaceId, buf, mime, kind: "source_document", originalName: file.name });
  const id = newId("inp");
  await ctx.db.insert(onboardingInputs).values({ id, workspaceId: ctx.workspaceId, sessionId, kind: "document", assetId: a.id, status: "processing", meta: { name: file.name.slice(0, 120), size: buf.length, docType: kind } });
  if (buf.length <= INLINE_EXTRACT_LIMIT) await extractInput(ctx.db, ctx.workspaceId, id, buf);
  return (await ctx.db.query.onboardingInputs.findFirst({ where: eq(onboardingInputs.id, id) }))!;
}

/** Extracts text from a document input (inline for small files, or from the research job). */
export async function extractInput(db: DB, workspaceId: string, inputId: string, preloaded?: Buffer) {
  const input = await db.query.onboardingInputs.findFirst({ where: and(eq(onboardingInputs.id, inputId), eq(onboardingInputs.workspaceId, workspaceId)) });
  if (!input || input.kind !== "document" || input.status !== "processing" || !input.assetId) return;
  const asset = await db.query.assets.findFirst({ where: and(eq(assets.id, input.assetId), eq(assets.workspaceId, workspaceId)) });
  if (!asset) return;
  const buf = preloaded ?? (await readAssetBytes(asset.storageKey));
  const kind = detectDocument(buf, String(input.meta.name ?? ""));
  try {
    if (!kind) throw new Error("unsupported");
    const { text, pages } = await extractDocumentText(buf, kind);
    await db
      .update(onboardingInputs)
      .set(text ? { status: "ready", text, meta: { ...input.meta, pages, chars: text.length } } : { status: "failed", error: "wizard.docNoText" })
      .where(eq(onboardingInputs.id, inputId));
  } catch {
    await db.update(onboardingInputs).set({ status: "failed", error: "wizard.docUnreadable" }).where(eq(onboardingInputs.id, inputId));
  }
}

/** Voice note: stored privately, transcribed by the STT adapter. Without STT the seller types instead. */
export async function addVoiceInput(ctx: Ctx, sessionId: string, file: File, durationSec: number): Promise<WizardInput> {
  await loadWizard(ctx, sessionId);
  if ((await countInputs(ctx, sessionId)) >= MAX_INPUTS) throw new AppError("wizard.tooManyFiles", { max: MAX_INPUTS });
  const buf = Buffer.from(await file.arrayBuffer());
  if (buf.length > VOICE_LIMIT) throw new AppError("upload.tooLarge", { mb: 10 });
  const mime = detectAudioMime(buf, file.type);
  if (!mime) throw new AppError("wizard.badAudio");
  const a = await storeBytes(ctx.db, { workspaceId: ctx.workspaceId, buf, mime, kind: "voice", originalName: "voice-note" });
  const id = newId("inp");
  const meta = { durationSec: Math.max(0, Math.min(600, Math.round(durationSec))), mime };
  if (!transcriptionConfigured()) {
    const [row] = await ctx.db
      .insert(onboardingInputs)
      .values({ id, workspaceId: ctx.workspaceId, sessionId, kind: "voice", assetId: a.id, status: "unsupported", error: "wizard.sttNotConfigured", meta })
      .returning();
    return row!;
  }
  await ctx.db.insert(onboardingInputs).values({ id, workspaceId: ctx.workspaceId, sessionId, kind: "voice", assetId: a.id, status: "processing", meta });
  try {
    const text = await transcribeAudio(buf, mime, ctx.locale);
    await ctx.db
      .update(onboardingInputs)
      .set(text ? { status: "ready", text: text.slice(0, 4000) } : { status: "failed", error: "wizard.sttEmpty" })
      .where(eq(onboardingInputs.id, id));
  } catch (e) {
    await ctx.db
      .update(onboardingInputs)
      .set({ status: "failed", error: e instanceof AIProviderError && e.code === "ai.rateLimited" ? "ai.rateLimited" : "wizard.sttFailed" })
      .where(eq(onboardingInputs.id, id));
  }
  return (await ctx.db.query.onboardingInputs.findFirst({ where: eq(onboardingInputs.id, id) }))!;
}

/** Seller corrects a transcript (or types what they said when STT is unavailable). */
export async function updateInputText(ctx: Ctx, inputId: string, text: string) {
  const r = await ctx.db
    .update(onboardingInputs)
    .set({ text: text.slice(0, 4000), textEdited: true, status: "ready", error: null })
    .where(and(eq(onboardingInputs.id, inputId), eq(onboardingInputs.workspaceId, ctx.workspaceId), inArray(onboardingInputs.kind, ["voice"])))
    .returning({ id: onboardingInputs.id });
  if (!r.length) throw new AppError("errors.notFound");
}

export async function removeInput(ctx: Ctx, inputId: string) {
  await ctx.db.delete(onboardingInputs).where(and(eq(onboardingInputs.id, inputId), eq(onboardingInputs.workspaceId, ctx.workspaceId)));
}

export async function submitIdea(ctx: Ctx, sessionId: string, text: string) {
  const s = await loadWizard(ctx, sessionId);
  const inputs = await listInputs(ctx.db, ctx.workspaceId, sessionId);
  const t = text.trim().slice(0, 4000);
  const usable = inputs.some((i) => i.status === "ready" || i.status === "processing");
  if (!t && !usable) throw new AppError("onboarding.emptyInput");
  await track(ctx.db, "idea_submitted", { workspaceId: ctx.workspaceId, userId: ctx.userId, props: { inputs: inputs.length, hasText: Boolean(t) } });
  return savePatch(ctx, s, { ideaText: t, stage: "details", lastError: null });
}

// ---------------------------------------------------------------- DETAILS
export function parseLinks(raw: string[]): { links: OnboardingLink[]; invalid: string[] } {
  const links: OnboardingLink[] = [];
  const invalid: string[] = [];
  for (const r of raw.map((x) => x.trim()).filter(Boolean).slice(0, MAX_LINKS)) {
    const l = normalizeLink(r);
    if (!l) invalid.push(r);
    else if (!links.some((x) => x.url === l.url)) links.push(l);
  }
  return { links, invalid };
}

/** Saves links (optional step) and starts the research job that produces the business profile. */
export async function submitDetails(ctx: Ctx, sessionId: string, rawLinks: string[], noLinks: boolean) {
  const s = await loadWizard(ctx, sessionId);
  const { links, invalid } = parseLinks(noLinks ? [] : rawLinks);
  if (invalid.length) throw new AppError("wizard.invalidLinks", { links: invalid.join(", ") });
  await savePatch(ctx, s, { links, noLinks: noLinks || links.length === 0 });
  const { job } = await enqueueJob(ctx.db, { workspaceId: ctx.workspaceId, userId: ctx.userId, kind: "onboarding.research", input: { sessionId, locale: ctx.locale } });
  await track(ctx.db, "details_submitted", { workspaceId: ctx.workspaceId, props: { links: links.map((l) => l.platform) } });
  const updated = await savePatch(ctx, await loadWizard(ctx, sessionId), { researchJobId: job.id, stage: "profile" });
  return { session: updated, job };
}

/** Re-runs profile generation using the sources already collected. */
export async function regenerateProfile(ctx: Ctx, sessionId: string) {
  const s = await loadWizard(ctx, sessionId);
  const { job } = await enqueueJob(ctx.db, { workspaceId: ctx.workspaceId, userId: ctx.userId, kind: "onboarding.research", input: { sessionId, locale: ctx.locale, regenerate: true } });
  await savePatch(ctx, s, { researchJobId: job.id });
  return job;
}

// ---------------------------------------------------------------- PROFILE
export const EDITABLE_FIELDS = [
  "business_name",
  "tagline",
  "short_description",
  "description",
  "product_name",
  "target_audience",
  "value_proposition",
  "usp",
  "brand_tone",
  "brand_primary",
  "brand_accent",
  "price",
  "contact_email",
  "contact_phone",
  "location",
] as const;
export type EditableField = (typeof EDITABLE_FIELDS)[number];

/** Fields that are business-critical; when missing they are highlighted before approval. */
export const CRITICAL_FIELDS: EditableField[] = ["business_name", "product_name", "price"];

export function normalizeProfileValue(key: string, raw: string): string | number | null {
  const v = raw.trim();
  if (!v) return null;
  if (key === "price" || key === "shipping_fee") {
    const m = v.replace(/,/g, ".").match(/\d+(?:\.\d{1,2})?/);
    return m ? parseRinggitToSen(m[0]) : null;
  }
  if (key === "brand_primary" || key === "brand_accent") return /^#[0-9a-fA-F]{6}$/.test(v) ? v.toUpperCase() : null;
  if (key === "contact_email") return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v) ? v.toLowerCase().slice(0, 200) : null;
  if (key === "contact_phone") return /^\+?[0-9 ()-]{7,20}$/.test(v) ? v.replace(/[^\d+]/g, "") : null;
  if (key === "capacity") {
    const n = parseInt(v, 10);
    return Number.isFinite(n) && n > 0 ? n : null;
  }
  if (key === "fulfillment") {
    const l = v.toLowerCase();
    if (/(both|kedua|dua-dua)/.test(l)) return "both";
    if (/(pickup|pick up|ambil|self.?collect)/.test(l)) return "pickup";
    if (/(ship|pos|courier|kurier|hantar|delivery|penghantaran)/.test(l)) return "shipping";
    return null;
  }
  return v.slice(0, 1000);
}

export async function updateProfileFields(ctx: Ctx, values: Partial<Record<string, string>>, faq?: { q: string; a: string }[], category?: string | null) {
  const p = await ctx.db.query.businessProfiles.findFirst({ where: eq(businessProfiles.workspaceId, ctx.workspaceId) });
  if (!p) throw new AppError("errors.notFound");
  const fields = { ...p.fields };
  const invalid: string[] = [];
  for (const [k, raw] of Object.entries(values)) {
    if (!(EDITABLE_FIELDS as readonly string[]).includes(k) || raw === undefined) continue;
    if (!raw.trim()) {
      fields[k] = { value: null, status: "missing" };
      continue;
    }
    const v = normalizeProfileValue(k, raw);
    if (v === null) invalid.push(k);
    else if (String(fields[k]?.value ?? "") !== String(v)) fields[k] = { value: v, status: "user", source: "seller" };
  }
  if (invalid.length) throw new AppError("onboarding.invalidFacts", { fields: invalid.join(", ") });
  if (category !== undefined) {
    if (category !== null && !isCategory(category)) throw new AppError("errors.validation");
    fields.category = category ? { value: category, status: "user", source: "seller" } : { value: null, status: "missing" };
  }
  await ctx.db
    .update(businessProfiles)
    .set({
      fields,
      ...(faq ? { faq: faq.filter((f) => f.q.trim() && f.a.trim()).slice(0, 12).map((f) => ({ q: f.q.trim().slice(0, 200), a: f.a.trim().slice(0, 800), status: "user" as const })) } : {}),
      updatedAt: new Date(),
    })
    .where(eq(businessProfiles.workspaceId, ctx.workspaceId));
}

export function profileCategory(fields: Record<string, ProfileField>): Category | null {
  const c = fields.category?.value;
  return isCategory(c) ? c : null;
}

/** Products identified by the research job (prices already verified against the seller's material). */
export async function foundProducts(ctx: Ctx, s: WizardSession): Promise<{ name: string; description: string; priceSen: number | null }[]> {
  if (!s.researchJobId) return [];
  const job = await getJob(ctx.db, ctx.workspaceId, s.researchJobId);
  const list = (job?.output.prepare_profile as { products?: unknown } | undefined)?.products;
  return Array.isArray(list) ? list.filter((x): x is { name: string; description: string; priceSen: number | null } => typeof x?.name === "string") : [];
}

const norm = (v: string) => v.toLowerCase().replace(/\s+/g, " ").trim();

/**
 * Approve: snapshot a versioned profile (the shared business context), name the workspace,
 * set the confirmed category, create/update the main product draft and add the other products
 * the seller kept. `includeProducts` names come from the client but are matched against the
 * server-side research output — the client can't inject arbitrary products or prices.
 */
export async function approveProfile(ctx: Ctx, sessionId: string, includeProducts?: string[]) {
  const s = await loadWizard(ctx, sessionId);
  const p = await ctx.db.query.businessProfiles.findFirst({ where: eq(businessProfiles.workspaceId, ctx.workspaceId) });
  if (!p) throw new AppError("errors.notFound");
  const category = profileCategory(p.fields);
  if (!category) throw new AppError("onboarding.categoryRequired");
  const name = p.fields.business_name?.status !== "missing" ? p.fields.business_name?.value : null;
  if (!name) throw new AppError("onboarding.missingFacts", { fields: "business_name" });

  const fields: Record<string, ProfileField> = {};
  for (const [k, f] of Object.entries(p.fields)) fields[k] = f.status === "missing" ? f : { ...f, status: "confirmed" };
  const faq = p.faq.map((f) => ({ ...f, status: "confirmed" as const }));
  const version = p.version + 1;
  await ctx.db.transaction(async (tx) => {
    await tx.update(businessProfiles).set({ fields, faq, confirmedAt: new Date(), version, updatedAt: new Date() }).where(eq(businessProfiles.workspaceId, ctx.workspaceId));
    await tx.insert(businessProfileVersions).values({ id: newId("bpv"), workspaceId: ctx.workspaceId, version, category, fields, faq, approvedBy: ctx.userId });
    await tx.update(workspaces).set({ name: String(name).slice(0, 80), category }).where(eq(workspaces.id, ctx.workspaceId));
    await audit(tx, { workspaceId: ctx.workspaceId, actorUserId: ctx.userId, action: "profile.approved", data: { version } });
  });
  await upsertMainProduct(ctx, s, category, fields);
  if (includeProducts?.length) await addFoundProducts(ctx, s, category, fields, includeProducts);
  await track(ctx.db, "business_profile_approved", { workspaceId: ctx.workspaceId, props: { category, version } });
  return savePatch(ctx, s, { stage: "store", category, lastError: null });
}

async function upsertMainProduct(ctx: Ctx, s: WizardSession, category: Category, f: Record<string, ProfileField>) {
  const v = (k: string) => (f[k] && f[k].status !== "missing" && f[k].value != null ? f[k].value : null);
  const priceSen = Number(v("price") ?? 0);
  const firstImage = (await listInputs(ctx.db, ctx.workspaceId, s.id)).find((i) => i.kind === "image")?.assetId ?? undefined;
  const input = {
    type: category,
    name: String(v("product_name") ?? v("business_name") ?? "Product").slice(0, 120),
    description: String(v("description") ?? v("short_description") ?? "").slice(0, 2000),
    price: (priceSen / 100).toFixed(2),
    shippingFlat: v("shipping_fee") != null ? (Number(v("shipping_fee")) / 100).toFixed(2) : undefined,
    fulfillment: category === "physical" ? ((v("fulfillment") as "shipping" | "pickup" | "both" | null) ?? "shipping") : undefined,
    // Services need a scope; fall back to the seller-approved description rather than inventing one.
    serviceScope: category === "service" ? String(v("service_scope") ?? v("short_description") ?? v("description") ?? v("product_name") ?? "").slice(0, 2000) || undefined : undefined,
    serviceDuration: v("duration") ? String(v("duration")) : undefined,
    imageAssetId: firstImage,
    status: "draft" as const,
  };
  const existing = await ctx.db.query.products.findFirst({ where: eq(products.workspaceId, ctx.workspaceId), orderBy: asc(products.createdAt) });
  // Only the onboarding-created draft is updated; products the seller already edited/activated are left alone.
  if (existing && existing.status === "draft") await updateProduct(ctx, existing.id, { ...input, imageAssetId: existing.imageAssetId ?? input.imageAssetId });
  else if (!existing) await createProduct(ctx, input);
}

/** Creates draft products for the selected identified products. Idempotent by name; stops at the plan limit. */
async function addFoundProducts(ctx: Ctx, s: WizardSession, category: Category, f: Record<string, ProfileField>, include: string[]) {
  const wanted = new Set(include.map(norm));
  const found = (await foundProducts(ctx, s)).filter((x) => wanted.has(norm(x.name)));
  if (!found.length) return { created: 0, skippedLimit: 0 };
  const existing = new Set((await ctx.db.query.products.findMany({ where: eq(products.workspaceId, ctx.workspaceId) })).map((x) => norm(x.name)));
  const fulfillment = f.fulfillment?.status !== "missing" ? (f.fulfillment?.value as "shipping" | "pickup" | "both" | undefined) : undefined;
  let created = 0;
  let skippedLimit = 0;
  for (const pr of found) {
    if (existing.has(norm(pr.name))) continue;
    try {
      await createProduct(ctx, {
        type: category,
        name: pr.name,
        description: pr.description,
        price: ((pr.priceSen ?? 0) / 100).toFixed(2),
        fulfillment: category === "physical" ? (fulfillment ?? "shipping") : undefined,
        serviceScope: category === "service" ? pr.description || pr.name : undefined,
        status: "draft",
      });
      existing.add(norm(pr.name));
      created++;
    } catch (e) {
      if (e instanceof AppError && e.code === "products.limitReached") skippedLimit++;
      else throw e;
    }
  }
  return { created, skippedLimit };
}

// ---------------------------------------------------------------- STORE → LAUNCH
export async function chooseWebsiteType(ctx: Ctx, sessionId: string, websiteType: string) {
  const { isWebsiteType, WEBSITE_TYPES } = await import("@/lib/website/types");
  const s = await loadWizard(ctx, sessionId);
  if (!isWebsiteType(websiteType)) throw new AppError("errors.validation");
  const ws = await ctx.db.query.workspaces.findFirst({ where: eq(workspaces.id, ctx.workspaceId) });
  if (!ws?.category || !WEBSITE_TYPES[websiteType].categories.includes(ws.category)) throw new AppError("wizard.websiteTypeIncompatible");
  const { job } = await enqueueJob(ctx.db, { workspaceId: ctx.workspaceId, userId: ctx.userId, kind: "website.generate", input: { sessionId, websiteType, locale: ctx.locale } });
  await track(ctx.db, "website_type_selected", { workspaceId: ctx.workspaceId, props: { websiteType } });
  return { session: await savePatch(ctx, s, { websiteType, generationJobId: job.id, stage: "launch" }), job };
}

export async function wizardJob(ctx: Ctx, s: WizardSession, kind: "research" | "generation"): Promise<Job | null> {
  const id = kind === "research" ? s.researchJobId : s.generationJobId;
  if (id) return getJob(ctx.db, ctx.workspaceId, id);
  return getActiveJob(ctx.db, ctx.workspaceId, kind === "research" ? "onboarding.research" : "website.generate");
}

export async function listSources(db: DB, workspaceId: string, sessionId: string) {
  return db.query.importedSources.findMany({ where: and(eq(importedSources.sessionId, sessionId), eq(importedSources.workspaceId, workspaceId)), orderBy: asc(importedSources.fetchedAt) });
}

export async function imagesForSession(db: DB, workspaceId: string, sessionId: string, max = 3): Promise<AIImage[]> {
  const inputs = (await listInputs(db, workspaceId, sessionId)).filter((i) => i.kind === "image" && i.assetId).slice(0, max);
  const out: AIImage[] = [];
  for (const i of inputs) {
    const a = await db.query.assets.findFirst({ where: and(eq(assets.id, i.assetId!), eq(assets.workspaceId, workspaceId)) });
    if (a) out.push({ mime: a.mime as AIImage["mime"], base64: (await readAssetBytes(a.storageKey)).toString("base64") });
  }
  return out;
}
