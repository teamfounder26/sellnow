import { and, eq } from "drizzle-orm";
import type { DB } from "@/lib/db";
import { businessProfiles, importedSources, onboardingSessions, type ProfileField } from "@/lib/db/schema";
import { newId } from "@/lib/ids";
import { isCategory, type Category } from "@/lib/categories";
import { runGeneration } from "@/lib/ai/run";
import { isAIConfigured } from "@/lib/ai/provider";
import { identifySchema, profileGenSchema, PROFILE_KEYS, type IdentifyOutput, type ProfileKey } from "@/lib/ai/schemas";
import { identifySystem, profileGenSystem } from "@/lib/ai/prompts";
import { researchLink, type LinkResearch } from "@/lib/ingest/links";
import { log } from "@/lib/log";
import { track } from "@/lib/audit";
import { defineJob, type StageContext } from "@/lib/jobs/runner";
import { WEBSITE_TYPE_IDS, WEBSITE_TYPES } from "@/lib/website/types";
import { CATEGORY_CONFIDENCE_THRESHOLD, extractInput, imagesForSession, listInputs, listSources, normalizeProfileValue } from "./wizard";

type Input = { sessionId: string; locale: "ms" | "en"; regenerate?: boolean };
type Fact = { field: ProfileKey; value: string; source: "user" | "extracted" | "ai_suggested" };
export type FoundProduct = { name: string; description: string; priceSen: number | null };

/** Fields the AI must never invent: only kept when their value is found in the seller's material. */
const VERIFIABLE: ProfileKey[] = ["price", "contact_email", "contact_phone", "location", "shipping_fee", "event_date", "capacity"];

async function session(db: DB, job: StageContext["job"]) {
  const { sessionId } = job.input as Input;
  const s = await db.query.onboardingSessions.findFirst({ where: and(eq(onboardingSessions.id, sessionId), eq(onboardingSessions.workspaceId, job.workspaceId)) });
  if (!s) throw new Error("session missing");
  return s;
}

/**
 * Seller material as (a) a prompt bundle with each item wrapped in <source> tags (untrusted data),
 * and (b) a flat lowercase corpus used to verify that "facts" really appear in the material.
 */
async function sourceBundle(db: DB, workspaceId: string, sessionId: string, ideaText: string) {
  const parts: string[] = [];
  if (ideaText.trim()) parts.push(`<source type="seller_message">\n${ideaText.trim()}\n</source>`);
  for (const i of await listInputs(db, workspaceId, sessionId)) {
    if (i.status !== "ready" || !i.text) continue;
    parts.push(`<source type="${i.kind === "voice" ? "voice_transcript" : "document"}" name="${String(i.meta.name ?? i.kind).replace(/"/g, "")}">\n${i.text.slice(0, 6000)}\n</source>`);
  }
  for (const s of await listSources(db, workspaceId, sessionId)) {
    if (s.status !== "fetched") {
      parts.push(`<source type="link" url="${s.url}" status="${s.status}">(content not available — seller-provided link only)</source>`);
      continue;
    }
    const e = s.extracted as { products?: unknown[]; organization?: unknown; text?: string };
    parts.push(
      `<source type="website" url="${s.url}">\ntitle: ${s.title ?? ""}\ndescription: ${s.description ?? ""}\nstructured_products: ${JSON.stringify(e.products ?? [])}\norganization: ${JSON.stringify(e.organization ?? {})}\ntext:\n${String(e.text ?? "").slice(0, 5000)}\n</source>`,
    );
  }
  const prompt = parts.join("\n\n");
  return { prompt, corpus: prompt.toLowerCase() };
}

export function verifiedInCorpus(field: ProfileKey, value: string, corpus: string): boolean {
  const v = value.trim().toLowerCase();
  if (!v) return false;
  if (field === "price" || field === "shipping_fee") {
    const n = v.replace(/,/g, ".").match(/\d+(?:\.\d{1,2})?/)?.[0];
    if (!n) return false;
    const num = Number(n);
    const variants = new Set([n, num.toFixed(2), String(num), num.toFixed(2).replace(".", ","), num.toFixed(0)]);
    return [...variants].some((x) => new RegExp(`(^|[^\\d])${x.replace(".", "\\.")}([^\\d]|$)`).test(corpus));
  }
  if (field === "contact_phone") {
    const d = v.replace(/\D/g, "").replace(/^60/, "0");
    return d.length >= 7 && corpus.replace(/\D/g, "").replace(/60(1\d)/g, "0$1").includes(d.slice(-8));
  }
  if (field === "capacity") return corpus.includes(String(parseInt(v, 10)));
  return corpus.includes(v.slice(0, 40));
}

function toStatus(source: Fact["source"]): ProfileField["status"] {
  return source === "ai_suggested" ? "ai_suggested" : source === "extracted" ? "extracted" : "user";
}

/** Applies integrity rules to model facts: verifiable fields must appear in the seller's material. */
export function sanitizeFacts(facts: Fact[], corpus: string): Fact[] {
  const out: Fact[] = [];
  for (const f of facts) {
    if (!(PROFILE_KEYS as readonly string[]).includes(f.field) || !f.value?.trim()) continue;
    if (VERIFIABLE.includes(f.field) && (f.source === "ai_suggested" || !verifiedInCorpus(f.field, f.value, corpus))) {
      log("info", "onboarding.fact_dropped", { field: f.field, reason: f.source === "ai_suggested" ? "suggested" : "not_in_sources" });
      continue;
    }
    // Claims of "user"/"extracted" provenance for free-text fields are downgraded when the text is nowhere in the material.
    const source = f.source !== "ai_suggested" && !VERIFIABLE.includes(f.field) && !verifiedInCorpus(f.field, f.value, corpus) ? "ai_suggested" : f.source;
    out.push({ ...f, source });
  }
  return out;
}

/** Deterministic extraction when no AI provider is configured (nothing is generated or guessed). */
function manualIdentify(ideaText: string, sources: LinkResearch[] | { extracted: Record<string, unknown>; title: string | null; description: string | null; status: string }[]): IdentifyOutput {
  const facts: Fact[] = [];
  const products: IdentifyOutput["products"] = [];
  if (ideaText.trim()) facts.push({ field: "description", value: ideaText.trim().slice(0, 1000), source: "user" });
  for (const s of sources as { extracted: Record<string, unknown>; title: string | null; description: string | null; status: string }[]) {
    if (s.status !== "fetched") continue;
    const e = s.extracted as { siteName?: string; organization?: { name?: string; telephone?: string; email?: string; address?: string }; products?: { name: string; description?: string; price?: string; currency?: string }[] };
    const name = e.organization?.name || e.siteName || (s.title ?? "").split(/\s[|–—-]\s/)[0];
    if (name) facts.push({ field: "business_name", value: name.slice(0, 80), source: "extracted" });
    if (s.description) facts.push({ field: "short_description", value: s.description, source: "extracted" });
    if (e.organization?.telephone) facts.push({ field: "contact_phone", value: e.organization.telephone, source: "extracted" });
    if (e.organization?.email) facts.push({ field: "contact_email", value: e.organization.email, source: "extracted" });
    if (e.organization?.address) facts.push({ field: "location", value: e.organization.address, source: "extracted" });
    for (const p of e.products ?? []) {
      const myr = !p.currency || /myr|rm/i.test(p.currency);
      products.push({ name: p.name, description: p.description ?? "", price: myr ? (p.price ?? null) : null, source: "extracted" });
    }
  }
  if (products[0]) {
    facts.push({ field: "product_name", value: products[0].name, source: "extracted" });
    if (products[0].price) facts.push({ field: "price", value: products[0].price, source: "extracted" });
  }
  return { category: null, confidence: 0, category_reason: "", clarification_question: null, products: products.slice(0, 10), facts, missing: [] };
}

export const researchJob = defineJob({
  kind: "onboarding.research",
  stages: [
    {
      // Checking your links
      key: "check_links",
      run: async ({ db, job }) => {
        const s = await session(db, job);
        return { links: s.links.map((l) => ({ url: l.url, platform: l.platform })) };
      },
    },
    {
      // Reading available information
      key: "read_sources",
      run: async ({ db, job, outputs }) => {
        const s = await session(db, job);
        const input = job.input as Input;
        // Large documents deferred at upload are read here.
        for (const i of await listInputs(db, job.workspaceId, s.id)) if (i.kind === "document" && i.status === "processing") await extractInput(db, job.workspaceId, i.id);
        if (input.regenerate) return { reused: true };
        await db.delete(importedSources).where(and(eq(importedSources.sessionId, s.id), eq(importedSources.workspaceId, job.workspaceId)));
        const links = (outputs.check_links as { links: { url: string; platform: "website" | "facebook" | "tiktok" | "instagram" | "other" }[] }).links;
        const results: { url: string; status: string }[] = [];
        for (const l of links) {
          const r = await researchLink(l);
          await db.insert(importedSources).values({
            id: newId("src"),
            workspaceId: job.workspaceId,
            sessionId: s.id,
            url: r.url,
            platform: r.platform,
            status: r.status,
            httpStatus: r.httpStatus ?? null,
            title: r.page?.title ?? null,
            description: r.page?.description ?? null,
            extracted: r.page ? { siteName: r.page.siteName, ogImage: r.page.ogImage, products: r.page.products, organization: r.page.organization, text: r.page.text } : {},
            error: r.error ?? null,
          });
          results.push({ url: r.url, status: r.status });
        }
        return { results };
      },
    },
    {
      // Identifying your products
      key: "identify",
      run: async ({ db, job }) => {
        const s = await session(db, job);
        const input = job.input as Input;
        const bundle = await sourceBundle(db, job.workspaceId, s.id, s.ideaText);
        if (!(await isAIConfigured())) return { mode: "manual", ...manualIdentify(s.ideaText, await listSources(db, job.workspaceId, s.id)) };
        const { data, imagesIgnored } = await runGeneration(db, {
          workspaceId: job.workspaceId,
          userId: job.userId ?? s.userId,
          task: "onboarding.identify",
          input: { sessionId: s.id, jobId: job.id },
          request: {
            system: identifySystem(input.locale),
            schema: identifySchema,
            images: await imagesForSession(db, job.workspaceId, s.id),
            prompt: `Seller material:\n\n${bundle.prompt || "(no text — see attached photos)"}\n\nIdentify the business.`,
          },
        });
        return { mode: "ai", ...data, facts: sanitizeFacts(data.facts, bundle.corpus), imagesIgnored: Boolean(imagesIgnored) };
      },
    },
    {
      // Preparing your business profile
      key: "prepare_profile",
      run: async ({ db, job, outputs }) => {
        const s = await session(db, job);
        const input = job.input as Input;
        const id = outputs.identify as IdentifyOutput & { mode: "ai" | "manual" };
        const bundle = await sourceBundle(db, job.workspaceId, s.id, s.ideaText);
        const confident = isCategory(id.category) && id.confidence >= CATEGORY_CONFIDENCE_THRESHOLD;
        const category = confident ? (id.category as Category) : null;

        let facts: Fact[] = id.facts as Fact[];
        let faq: { q: string; a: string }[] = [];
        let recommended: { type: string; reason: string } | null = null;
        if (id.mode === "ai") {
          const allowed = category ? WEBSITE_TYPE_IDS.filter((t) => WEBSITE_TYPES[t].categories.includes(category)) : WEBSITE_TYPE_IDS;
          const { data, generationId } = await runGeneration(db, {
            workspaceId: job.workspaceId,
            userId: job.userId ?? s.userId,
            task: "onboarding.profileGen",
            input: { sessionId: s.id, jobId: job.id },
            request: {
              system: profileGenSystem(input.locale, allowed),
              schema: profileGenSchema,
              prompt: `Category: ${category ?? `uncertain (best guess ${id.category ?? "none"})`}\nIdentified products: ${JSON.stringify(id.products)}\nFacts already identified (with sources): ${JSON.stringify(id.facts)}\n\nSeller material:\n\n${bundle.prompt}\n\nDraft the full business profile.`,
            },
          });
          // Keep identified facts; add profile fields the identify pass did not have.
          const have = new Set(facts.map((f) => f.field));
          facts = [...facts, ...sanitizeFacts(data.fields as Fact[], bundle.corpus).filter((f) => !have.has(f.field))];
          faq = data.faq.slice(0, 5);
          recommended = data.recommended_website;
          await track(db, "business_profile_created", { workspaceId: job.workspaceId, props: { mode: "ai", generationId } });
        }

        // Merge into the profile without overwriting anything the seller typed themselves.
        const profile = await db.query.businessProfiles.findFirst({ where: eq(businessProfiles.workspaceId, job.workspaceId) });
        const fields: Record<string, ProfileField> = {};
        for (const [k, f] of Object.entries(profile?.fields ?? {})) if (f.source === "seller" && f.status !== "missing") fields[k] = f;
        for (const f of facts) {
          if (fields[f.field]) continue;
          const v = normalizeProfileValue(f.field, f.value);
          if (v !== null) fields[f.field] = { value: v, status: toStatus(f.source), source: f.source === "ai_suggested" ? `ai:${job.id}` : f.source };
        }
        if (!fields.category) fields.category = category ? { value: category, status: "ai_suggested", source: `ai:${job.id}` } : { value: null, status: "missing" };
        for (const k of ["business_name", "product_name", "short_description", "target_audience", "price"]) if (!fields[k]) fields[k] = { value: null, status: "missing" };

        await db
          .update(businessProfiles)
          .set({ fields, faq: faq.map((f) => ({ ...f, status: "ai_suggested" as const })), confirmedAt: null, updatedAt: new Date() })
          .where(eq(businessProfiles.workspaceId, job.workspaceId));
        await db
          .update(onboardingSessions)
          .set({
            category,
            categoryConfidence: id.confidence,
            suggestedCategory: !category && isCategory(id.category) ? id.category : null,
            pendingQuestions: !category && id.clarification_question ? [{ field: "category", question: id.clarification_question }] : [],
            lastError: null,
            updatedAt: new Date(),
          })
          .where(eq(onboardingSessions.id, s.id));
        // Products the seller can turn into drafts on approval. A price is kept only if it appears in their material.
        const products: FoundProduct[] = [];
        for (const pr of id.products.slice(0, 10)) {
          const name = pr.name?.trim().slice(0, 120);
          if (!name || products.some((x) => x.name.toLowerCase() === name.toLowerCase())) continue;
          const priceOk = pr.price && pr.source !== "ai_suggested" && verifiedInCorpus("price", pr.price, bundle.corpus);
          const sen = priceOk ? normalizeProfileValue("price", pr.price!) : null;
          products.push({ name, description: (pr.description ?? "").slice(0, 2000), priceSen: typeof sen === "number" ? sen : null });
        }
        return { recommended, category, products, imagesIgnored: (id as { imagesIgnored?: boolean }).imagesIgnored ?? false };
      },
    },
  ],
  onFail: async ({ db, job }, code) => {
    const { sessionId } = job.input as Input;
    await db.update(onboardingSessions).set({ lastError: code, updatedAt: new Date() }).where(and(eq(onboardingSessions.id, sessionId), eq(onboardingSessions.workspaceId, job.workspaceId)));
  },
});
