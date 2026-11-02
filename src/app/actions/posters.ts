"use server";
import { revalidatePath } from "next/cache";
import { ZodError } from "zod";
import { requireWorkspace } from "@/lib/auth/session";
import { getLocale } from "@/lib/i18n/server";
import { appUrl } from "@/lib/http";
import { rateLimit } from "@/lib/rate-limit";
import { toActionError, type ActionResult } from "@/lib/errors";
import type { Role } from "@/lib/auth/service";
import * as svc from "@/lib/posters/service";
import { enqueueJob } from "@/lib/jobs/runner";
import { kickJob } from "@/lib/jobs/kick";
import { newId } from "@/lib/ids";

async function ctx(min: Role = "editor") {
  const { user, db, workspace } = await requireWorkspace(min);
  return { db, workspaceId: workspace.id, userId: user.id, locale: await getLocale() };
}
function done<T>(data: T): ActionResult<T> {
  revalidatePath("/dashboard/creative", "layout");
  return { ok: true, data };
}
function fail(e: unknown) {
  if (e instanceof ZodError) return { ok: false as const, error: "errors.validation" };
  return toActionError(e);
}
const aiLimited = (userId: string) => !rateLimit(`ai:${userId}`, 30, 10 * 60 * 1000).ok;

/** Validates, then queues the brief as a durable job; the client polls /api/jobs/[id]. */
export async function createPosterProjectAction(input: { productId: string; settings: unknown }): Promise<ActionResult<{ jobId: string; projectId: string }>> {
  try {
    const c = await ctx();
    if (aiLimited(c.userId)) return { ok: false, error: "errors.rateLimited" };
    await svc.validateBriefRequest(c, input);
    const projectId = newId("ppj");
    const { job } = await enqueueJob(c.db, { workspaceId: c.workspaceId, userId: c.userId, kind: "poster.brief", input: { mode: "create", projectId, productId: input.productId, settings: input.settings, locale: c.locale } });
    kickJob(job.id);
    return { ok: true, data: { jobId: job.id, projectId: (job.input as { projectId: string }).projectId } };
  } catch (e) {
    return fail(e);
  }
}

export async function regeneratePosterBriefAction(projectId: string, input: { settings?: unknown; intel?: unknown }): Promise<ActionResult<{ jobId: string; projectId: string }>> {
  try {
    const c = await ctx();
    if (aiLimited(c.userId)) return { ok: false, error: "errors.rateLimited" };
    await svc.validateBriefRequest(c, { projectId, ...input });
    const { job } = await enqueueJob(c.db, { workspaceId: c.workspaceId, userId: c.userId, kind: "poster.brief", input: { mode: "regenerate", projectId, settings: input.settings, intel: input.intel, locale: c.locale } });
    kickJob(job.id);
    return { ok: true, data: { jobId: job.id, projectId: (job.input as { projectId: string }).projectId } };
  } catch (e) {
    return fail(e);
  }
}

export async function updatePosterBriefAction(projectId: string, brief: unknown): Promise<ActionResult> {
  try {
    await svc.updateBrief(await ctx(), projectId, brief);
    return done(undefined);
  } catch (e) {
    return fail(e);
  }
}

export async function approvePosterBriefAction(projectId: string): Promise<ActionResult> {
  try {
    await svc.approveBrief(await ctx(), projectId);
    return done(undefined);
  } catch (e) {
    return fail(e);
  }
}

export async function updatePosterPromptAction(posterId: string, prompt: string): Promise<ActionResult> {
  try {
    await svc.updatePrompt(await ctx(), posterId, { prompt });
    return done(undefined);
  } catch (e) {
    return fail(e);
  }
}

export async function generatePosterAction(posterId: string, input: unknown): Promise<ActionResult<{ versionId: string; status: string }>> {
  try {
    const c = await ctx();
    if (!rateLimit(`posterimg:${c.userId}`, 20, 10 * 60 * 1000).ok) return { ok: false, error: "errors.rateLimited" };
    const v = await svc.generateVersion(c, posterId, input);
    return done({ versionId: v.id, status: v.status });
  } catch (e) {
    return fail(e);
  }
}

export async function editPosterCopyAction(posterId: string, copy: unknown): Promise<ActionResult<{ needsRegeneration: boolean }>> {
  try {
    const r = await svc.editCopy(await ctx(), posterId, copy);
    return done({ needsRegeneration: r.needsRegeneration });
  } catch (e) {
    return fail(e);
  }
}

export async function setPosterVersionAction(posterId: string, versionId: string): Promise<ActionResult> {
  try {
    await svc.setCurrentVersion(await ctx(), posterId, versionId);
    return done(undefined);
  } catch (e) {
    return fail(e);
  }
}

/** Receives the composed poster rendered in the browser (PNG/JPEG, magic-byte checked server-side). */
export async function savePosterRenderAction(versionId: string, form: FormData): Promise<ActionResult<{ assetId: string }>> {
  try {
    const c = await ctx();
    const file = form.get("file");
    if (!(file instanceof File) || file.size === 0) return { ok: false, error: "upload.badType" };
    return done({ assetId: await svc.saveRender(c, versionId, Buffer.from(await file.arrayBuffer())) });
  } catch (e) {
    return fail(e);
  }
}

export async function usePosterInAdsAction(posterId: string): Promise<ActionResult<{ adId: string }>> {
  try {
    return done({ adId: await svc.useInAds(await ctx(), posterId, await appUrl()) });
  } catch (e) {
    return fail(e);
  }
}

export async function duplicatePosterAction(posterId: string): Promise<ActionResult<{ id: string }>> {
  try {
    return done({ id: await svc.duplicatePoster(await ctx(), posterId) });
  } catch (e) {
    return fail(e);
  }
}
