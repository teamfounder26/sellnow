"use server";
import { revalidatePath } from "next/cache";
import { ZodError } from "zod";
import { requireWorkspace } from "@/lib/auth/session";
import { createProduct, updateProduct, type ProductInput } from "@/lib/products/service";
import { toActionError, type ActionResult } from "@/lib/errors";

function zodFields(e: ZodError) {
  const out: Record<string, string> = {};
  for (const i of e.issues) out[i.path.join(".") || "_"] ??= i.message.includes(".") ? i.message : "errors.validation";
  return out;
}

export async function saveProductAction(id: string | null, input: ProductInput): Promise<ActionResult<{ id: string }>> {
  try {
    const { db, workspace, user } = await requireWorkspace("editor");
    const ctx = { db, workspaceId: workspace.id, userId: user.id };
    const pid = id ? (await updateProduct(ctx, id, input), id) : await createProduct(ctx, input);
    revalidatePath("/dashboard", "layout");
    return { ok: true, data: { id: pid } };
  } catch (e) {
    if (e instanceof ZodError) return { ok: false, error: "errors.validation", fieldErrors: zodFields(e) };
    return toActionError(e);
  }
}
