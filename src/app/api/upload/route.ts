import { NextResponse } from "next/server";
import { getWorkspaceContext } from "@/lib/auth/session";
import { roleAtLeast } from "@/lib/auth/service";
import { storeAsset } from "@/lib/storage";
import { AppError } from "@/lib/errors";
import { rateLimit } from "@/lib/rate-limit";

/** Authenticated upload into the caller's active workspace. Images are public; digital files private. */
export async function POST(req: Request) {
  const ctx = await getWorkspaceContext("viewer");
  if (!ctx.workspace || !ctx.role || !roleAtLeast(ctx.role, "editor")) return NextResponse.json({ ok: false, error: "errors.permissionDenied" }, { status: 403 });
  if (!rateLimit(`upload:${ctx.user.id}`, 60, 60 * 60 * 1000).ok) return NextResponse.json({ ok: false, error: "errors.rateLimited" }, { status: 429 });
  const form = await req.formData();
  const file = form.get("file");
  const kind = form.get("kind") === "digital_file" ? "digital_file" : "image";
  if (!(file instanceof File) || file.size === 0) return NextResponse.json({ ok: false, error: "upload.badType" }, { status: 400 });
  try {
    const a = await storeAsset(ctx.db, { workspaceId: ctx.workspace.id, file, kind });
    return NextResponse.json({ ok: true, id: a.id, name: file.name });
  } catch (e) {
    const code = e instanceof AppError ? e.code : "errors.unexpected";
    return NextResponse.json({ ok: false, error: code }, { status: 400 });
  }
}
