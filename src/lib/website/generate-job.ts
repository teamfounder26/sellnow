import { and, eq } from "drizzle-orm";
import { onboardingSessions, storefronts, type StorefrontContent, type StorefrontSection, type StorefrontTheme } from "@/lib/db/schema";
import { defineJob, type StageContext } from "@/lib/jobs/runner";
import { getPaymentIntegration } from "@/lib/payments/integrations";
import { normalizeContent } from "@/lib/storefront/sections";
import { unlock } from "@/lib/achievements/service";
import { notify, track } from "@/lib/audit";
import type { StorefrontCopyOutput } from "@/lib/ai/schemas";
import { assembleSections, finalizeContent, loadContext, planBrand, planStructure, saveGeneratedDraft, writeContent, type GenCtx } from "./generator";
import { WEBSITE_TYPES, type WebsiteTypeId } from "./types";

type Input = { sessionId?: string; websiteType: string; locale: "ms" | "en" };

function gctx({ db, job }: StageContext): GenCtx {
  return { db, workspaceId: job.workspaceId, userId: job.userId ?? "", locale: (job.input as Input).locale };
}

/**
 * LAUNCH: website generation as a durable job. Each stage is real backend work and its output is
 * persisted, so a refresh or a crashed worker resumes from the last completed stage.
 */
export const generateWebsiteJob = defineJob({
  kind: "website.generate",
  stages: [
    {
      key: "understand", // Understanding your business
      run: async (c) => {
        const x = await loadContext(gctx(c));
        return { category: x.category, name: x.name, productCount: x.products.length };
      },
    },
    {
      key: "brand", // Preparing your brand
      run: async (c) => planBrand(await loadContext(gctx(c))),
    },
    {
      key: "structure", // Creating your website structure
      run: async (c) => {
        const r = planStructure(await loadContext(gctx(c)), (c.job.input as Input).websiteType);
        const sf = await c.db.query.storefronts.findFirst({ where: eq(storefronts.workspaceId, c.job.workspaceId) });
        if (sf && !sf.publishedVersionId) await c.db.update(storefronts).set({ status: "GENERATING" }).where(eq(storefronts.id, sf.id));
        return r;
      },
    },
    {
      key: "content", // Writing your content
      run: async (c) => {
        const { websiteType } = c.outputs.structure as { websiteType: WebsiteTypeId };
        return writeContent(gctx(c), await loadContext(gctx(c)), websiteType);
      },
    },
    {
      key: "style", // Styling your website
      run: async (c) => {
        const { websiteType } = c.outputs.structure as { websiteType: WebsiteTypeId };
        const { copy } = c.outputs.content as { copy: StorefrontCopyOutput | null };
        return { sections: assembleSections(gctx(c), await loadContext(gctx(c)), websiteType, copy) };
      },
    },
    {
      key: "components", // Preparing interactive components
      run: async (c) => {
        const { websiteType } = c.outputs.structure as { websiteType: WebsiteTypeId };
        const { sections } = c.outputs.style as { sections: StorefrontSection[] };
        const sf = await c.db.query.storefronts.findFirst({ where: eq(storefronts.workspaceId, c.job.workspaceId) });
        const content = finalizeContent(await loadContext(gctx(c)), websiteType, sections, sf?.draftContent);
        return { content, modules: WEBSITE_TYPES[websiteType].modules };
      },
    },
    {
      key: "check", // Checking your website
      validating: true,
      run: async (c) => {
        const { content } = c.outputs.components as { content: StorefrontContent };
        normalizeContent(content); // throws if anything is structurally invalid
        const notes: string[] = [];
        if (content.salesMode === "checkout" && !(await getPaymentIntegration(c.db, c.job.workspaceId))) notes.push("paymentNotConnected");
        if (!content.policies?.contactEmail) notes.push("contactEmailMissing");
        return { notes };
      },
    },
    {
      key: "ready", // Your website is ready
      run: async (c) => {
        const { content } = c.outputs.components as { content: StorefrontContent };
        const { theme } = c.outputs.brand as { theme: StorefrontTheme };
        const id = await saveGeneratedDraft(gctx(c), await loadContext(gctx(c)), content, theme, c.job.id);
        return { storefrontId: id };
      },
    },
  ],
  onComplete: async ({ db, job, outputs }) => {
    const input = job.input as Input;
    const { storefrontId } = outputs.ready as { storefrontId: string };
    // First valid generated draft → Website Creator L1. Regenerations hit the unique constraint (no repeat).
    await unlock(db, job.workspaceId, "website_creator", 1, { type: "storefront", id: storefrontId });
    await notify(db, job.workspaceId, "website.ready", { storefrontId });
    await track(db, "website_generated", { workspaceId: job.workspaceId, props: { websiteType: input.websiteType, mode: (outputs.content as { mode: string }).mode } });
    if (input.sessionId) {
      await db.update(onboardingSessions).set({ stage: "done", lastError: null, updatedAt: new Date() }).where(and(eq(onboardingSessions.id, input.sessionId), eq(onboardingSessions.workspaceId, job.workspaceId)));
    }
  },
  onFail: async ({ db, job }, code) => {
    const input = job.input as Input;
    const sf = await db.query.storefronts.findFirst({ where: eq(storefronts.workspaceId, job.workspaceId) });
    if (sf?.status === "GENERATING") await db.update(storefronts).set({ status: sf.lastGenerationJobId ? "READY_FOR_REVIEW" : "FAILED" }).where(eq(storefronts.id, sf.id));
    if (input.sessionId) await db.update(onboardingSessions).set({ lastError: code, updatedAt: new Date() }).where(and(eq(onboardingSessions.id, input.sessionId), eq(onboardingSessions.workspaceId, job.workspaceId)));
  },
});
