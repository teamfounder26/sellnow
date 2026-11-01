"use server";
import { revalidatePath } from "next/cache";
import { requireUser, setActiveWorkspace, requireWorkspace } from "@/lib/auth/session";
import { getDb } from "@/lib/db";
import { createWorkspace } from "@/lib/workspace/service";
import { listMemberships } from "@/lib/auth/service";
import { toActionError, type ActionResult } from "@/lib/errors";
import { getLocale } from "@/lib/i18n/server";
import { rateLimit } from "@/lib/rate-limit";
import * as wz from "@/lib/onboarding/wizard";
import { kickJob } from "@/lib/jobs/kick";
import { retryJob } from "@/lib/jobs/runner";
import type { OnboardingStage } from "@/lib/db/schema";

async function ctx() {
  const { user, db, workspace } = await requireWorkspace("editor");
  return { db, workspaceId: workspace.id, userId: user.id, locale: await getLocale() };
}

function ok<T>(data: T): ActionResult<T> {
  revalidatePath("/onboarding");
  return { ok: true, data };
}

/** Ensures the signed-in user has a workspace to build in (first-run). */
export async function ensureWorkspaceAction(): Promise<ActionResult> {
  try {
    const user = await requireUser();
    const db = await getDb();
    const existing = await listMemberships(db, user.id);
    const id = existing[0]?.workspace.id ?? (await createWorkspace(db, user.id, (await getLocale()) === "ms" ? "Perniagaan Baharu" : "New Business"));
    await setActiveWorkspace(id);
    return ok(undefined);
  } catch (e) {
    return toActionError(e);
  }
}

export async function saveIdeaTextAction(sessionId: string, text: string): Promise<ActionResult> {
  try {
    await wz.saveIdeaText(await ctx(), sessionId, text);
    return { ok: true, data: undefined }; // autosave: no revalidation needed
  } catch (e) {
    return toActionError(e);
  }
}

export type InputView = { id: string; kind: "image" | "document" | "voice"; status: string; name: string; text: string | null; error: string | null; assetId: string | null; durationSec?: number };

function view(i: wz.WizardInput): InputView {
  return {
    id: i.id,
    kind: i.kind,
    status: i.status,
    name: String(i.meta.name ?? ""),
    text: i.text,
    error: i.error,
    assetId: i.kind === "image" ? i.assetId : null,
    durationSec: typeof i.meta.durationSec === "number" ? i.meta.durationSec : undefined,
  };
}

export async function addFileAction(sessionId: string, form: FormData): Promise<ActionResult<InputView>> {
  try {
    const c = await ctx();
    if (!rateLimit(`upload:${c.userId}`, 60, 60 * 60 * 1000).ok) return { ok: false, error: "errors.rateLimited" };
    const file = form.get("file");
    if (!(file instanceof File) || file.size === 0) return { ok: false, error: "wizard.badFileType" };
    return ok(view(await wz.addFileInput(c, sessionId, file)));
  } catch (e) {
    return toActionError(e);
  }
}

export async function addVoiceAction(sessionId: string, form: FormData): Promise<ActionResult<InputView>> {
  try {
    const c = await ctx();
    if (!rateLimit(`voice:${c.userId}`, 30, 60 * 60 * 1000).ok) return { ok: false, error: "errors.rateLimited" };
    const file = form.get("audio");
    if (!(file instanceof File) || file.size === 0) return { ok: false, error: "wizard.badAudio" };
    return ok(view(await wz.addVoiceInput(c, sessionId, file, Number(form.get("duration") ?? 0))));
  } catch (e) {
    return toActionError(e);
  }
}

export async function updateInputTextAction(inputId: string, text: string): Promise<ActionResult> {
  try {
    await wz.updateInputText(await ctx(), inputId, text);
    return ok(undefined);
  } catch (e) {
    return toActionError(e);
  }
}

export async function removeInputAction(inputId: string): Promise<ActionResult> {
  try {
    await wz.removeInput(await ctx(), inputId);
    return ok(undefined);
  } catch (e) {
    return toActionError(e);
  }
}

export async function submitIdeaAction(sessionId: string, text: string): Promise<ActionResult> {
  try {
    await wz.submitIdea(await ctx(), sessionId, text);
    return ok(undefined);
  } catch (e) {
    return toActionError(e);
  }
}

export async function submitDetailsAction(sessionId: string, links: string[], noLinks: boolean): Promise<ActionResult> {
  try {
    const c = await ctx();
    if (!rateLimit(`ai:${c.userId}`, 30, 10 * 60 * 1000).ok) return { ok: false, error: "errors.rateLimited" };
    const { job } = await wz.submitDetails(c, sessionId, links, noLinks);
    kickJob(job.id);
    return ok(undefined);
  } catch (e) {
    return toActionError(e);
  }
}

export async function regenerateProfileAction(sessionId: string): Promise<ActionResult> {
  try {
    const c = await ctx();
    if (!rateLimit(`ai:${c.userId}`, 30, 10 * 60 * 1000).ok) return { ok: false, error: "errors.rateLimited" };
    kickJob((await wz.regenerateProfile(c, sessionId)).id);
    return ok(undefined);
  } catch (e) {
    return toActionError(e);
  }
}

export async function updateProfileAction(values: Record<string, string>, faq: { q: string; a: string }[], category?: string | null): Promise<ActionResult> {
  try {
    await wz.updateProfileFields(await ctx(), values, faq, category);
    return ok(undefined);
  } catch (e) {
    return toActionError(e);
  }
}

export async function approveProfileAction(sessionId: string, includeProducts: string[] = []): Promise<ActionResult> {
  try {
    await wz.approveProfile(await ctx(), sessionId, includeProducts.slice(0, 10).map((n) => String(n).slice(0, 120)));
    revalidatePath("/dashboard", "layout");
    return ok(undefined);
  } catch (e) {
    return toActionError(e);
  }
}

export async function chooseWebsiteTypeAction(sessionId: string, websiteType: string): Promise<ActionResult> {
  try {
    const c = await ctx();
    const { job } = await wz.chooseWebsiteType(c, sessionId, websiteType);
    kickJob(job.id);
    return ok(undefined);
  } catch (e) {
    return toActionError(e);
  }
}

export async function retryJobAction(jobId: string): Promise<ActionResult> {
  try {
    const c = await ctx();
    const job = await retryJob(c.db, c.workspaceId, jobId);
    kickJob(job.id);
    return ok(undefined);
  } catch (e) {
    return toActionError(e);
  }
}

export async function goToStageAction(sessionId: string, stage: string): Promise<ActionResult> {
  try {
    if (!(wz.STAGES as string[]).includes(stage)) return { ok: false, error: "errors.validation" };
    await wz.goToStage(await ctx(), sessionId, stage as OnboardingStage);
    return ok(undefined);
  } catch (e) {
    return toActionError(e);
  }
}
