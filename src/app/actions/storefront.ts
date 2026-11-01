"use server";
import { revalidatePath } from "next/cache";
import { ZodError } from "zod";
import { requireWorkspace } from "@/lib/auth/session";
import { getLocale } from "@/lib/i18n/server";
import * as sf from "@/lib/storefront/service";
import { toActionError, type ActionResult } from "@/lib/errors";

async function ctx(min: "editor" | "admin" = "editor") {
  const { db, workspace, user } = await requireWorkspace(min);
  return { db, workspaceId: workspace.id, userId: user.id, locale: await getLocale() };
}

export async function generateStorefrontAction(useAI: boolean): Promise<ActionResult> {
  try {
    await sf.generateStorefrontDraft(await ctx(), { useAI });
    revalidatePath("/dashboard", "layout");
    return { ok: true, data: undefined };
  } catch (e) {
    return toActionError(e);
  }
}

export async function saveStorefrontDraftAction(content: unknown, theme: unknown): Promise<ActionResult> {
  try {
    await sf.saveDraft(await ctx(), { content, theme });
    revalidatePath("/dashboard/storefront");
    return { ok: true, data: undefined };
  } catch (e) {
    if (e instanceof ZodError) return { ok: false, error: "errors.validation" };
    return toActionError(e);
  }
}

export async function publishStorefrontAction(): Promise<ActionResult<{ slug: string; firstPublish: boolean } | { issues: sf.PublishIssue[] }>> {
  try {
    const c = await ctx("admin");
    const r = await sf.publishStorefront(c);
    revalidatePath("/dashboard", "layout");
    if (r.ok) return { ok: true, data: { slug: r.slug, firstPublish: r.firstPublish } };
    return { ok: true, data: { issues: r.issues } };
  } catch (e) {
    return toActionError(e);
  }
}

export async function unpublishStorefrontAction(): Promise<ActionResult> {
  try {
    await sf.unpublishStorefront(await ctx("admin"));
    revalidatePath("/dashboard", "layout");
    return { ok: true, data: undefined };
  } catch (e) {
    return toActionError(e);
  }
}

export async function updateSlugAction(slug: string): Promise<ActionResult> {
  try {
    await sf.updateSlug(await ctx("admin"), slug);
    revalidatePath("/dashboard/storefront");
    return { ok: true, data: undefined };
  } catch (e) {
    return toActionError(e);
  }
}

/** Read-only publish readiness check (used by the preview's Publish dialog before confirmation). */
export async function checkPublishAction(): Promise<ActionResult<{ issues: sf.PublishIssue[]; salesMode: "checkout" | "enquiry"; paymentConnected: boolean }>> {
  try {
    const c = await ctx("admin");
    const store = await sf.getStorefront(c.db, c.workspaceId);
    if (!store) return { ok: false, error: "publish.noStorefront" };
    const { getPaymentIntegration } = await import("@/lib/payments/integrations");
    const [issues, payment] = await Promise.all([sf.validateForPublish(c.db, c.workspaceId, c.userId), getPaymentIntegration(c.db, c.workspaceId)]);
    return { ok: true, data: { issues, salesMode: store.draftContent.salesMode ?? "checkout", paymentConnected: Boolean(payment) } };
  } catch (e) {
    return toActionError(e);
  }
}

/** Switch between selling online and an enquiry-only site (no online payment). */
export async function setSalesModeAction(mode: "checkout" | "enquiry"): Promise<ActionResult> {
  try {
    const c = await ctx("admin");
    const store = await sf.getStorefront(c.db, c.workspaceId);
    if (!store) return { ok: false, error: "errors.notFound" };
    await sf.saveDraft(c, { content: { ...store.draftContent, salesMode: mode === "enquiry" ? "enquiry" : "checkout" }, theme: store.draftTheme });
    revalidatePath("/preview");
    return { ok: true, data: undefined };
  } catch (e) {
    return toActionError(e);
  }
}

/** Saves the contact email policy from the publish dialog (the only always-required policy). */
export async function setContactEmailAction(email: string): Promise<ActionResult> {
  try {
    const c = await ctx("admin");
    const store = await sf.getStorefront(c.db, c.workspaceId);
    if (!store) return { ok: false, error: "errors.notFound" };
    await sf.saveDraft(c, { content: { ...store.draftContent, policies: { ...store.draftContent.policies, contactEmail: email.trim() } }, theme: store.draftTheme });
    return { ok: true, data: undefined };
  } catch (e) {
    if (e instanceof ZodError) return { ok: false, error: "checkout.emailInvalid" };
    return toActionError(e);
  }
}
