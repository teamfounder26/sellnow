import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { DB } from "@/lib/db";
import { assets } from "@/lib/db/schema";
import { newId } from "@/lib/ids";
import { AppError } from "@/lib/errors";

/**
 * Object storage adapter. Development uses the local filesystem under ./.data/storage (outside
 * the public web root). In production, implement the same two functions against S3/R2/GCS and
 * select via STORAGE_DRIVER — protected files must never be exposed through public bucket URLs.
 */
const ROOT = () => path.join(process.cwd(), ".data", "storage");

export const IMAGE_LIMIT = 5 * 1024 * 1024;
export const DIGITAL_LIMIT = 50 * 1024 * 1024;

const IMAGE_TYPES = {
  "image/jpeg": (b: Buffer) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff,
  "image/png": (b: Buffer) => b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])),
  "image/webp": (b: Buffer) => b.subarray(0, 4).toString("ascii") === "RIFF" && b.subarray(8, 12).toString("ascii") === "WEBP",
} as const;

const DIGITAL_TYPES: Record<string, (b: Buffer) => boolean> = {
  "application/pdf": (b) => b.subarray(0, 5).toString("ascii") === "%PDF-",
  "application/zip": (b) => b[0] === 0x50 && b[1] === 0x4b,
  "application/epub+zip": (b) => b[0] === 0x50 && b[1] === 0x4b,
  "audio/mpeg": (b) => b.subarray(0, 3).toString("ascii") === "ID3" || (b[0] === 0xff && ((b[1] ?? 0) & 0xe0) === 0xe0),
  "video/mp4": (b) => b.subarray(4, 8).toString("ascii") === "ftyp",
};

export type ImageMime = keyof typeof IMAGE_TYPES;

export function detectImageMime(buf: Buffer): ImageMime | null {
  for (const [mime, check] of Object.entries(IMAGE_TYPES)) if (check(buf)) return mime as ImageMime;
  return null;
}

export function validateDigital(buf: Buffer, declared: string): string | null {
  const check = DIGITAL_TYPES[declared];
  return check && check(buf) ? declared : null;
}

export const VOICE_LIMIT = 10 * 1024 * 1024;

/** Audio-only containers produced by browser MediaRecorder. Video uploads are never accepted. */
export function detectAudioMime(buf: Buffer, declared: string): string | null {
  const d = declared.split(";")[0]!.trim().toLowerCase();
  if (!d.startsWith("audio/")) return null;
  if (buf.subarray(0, 4).equals(Buffer.from([0x1a, 0x45, 0xdf, 0xa3]))) return "audio/webm";
  if (buf.subarray(0, 4).toString("ascii") === "OggS") return "audio/ogg";
  if (buf.subarray(0, 4).toString("ascii") === "RIFF" && buf.subarray(8, 12).toString("ascii") === "WAVE") return "audio/wav";
  if (buf.subarray(4, 8).toString("ascii") === "ftyp") return "audio/mp4";
  if (buf.subarray(0, 3).toString("ascii") === "ID3" || (buf[0] === 0xff && ((buf[1] ?? 0) & 0xe0) === 0xe0)) return "audio/mpeg";
  return null;
}

/** Stores already-validated bytes (private documents and voice notes). Tenant-scoped storage key. */
export async function storeBytes(
  db: DB,
  opts: { workspaceId: string; buf: Buffer; mime: string; kind: "source_document" | "voice" | "awb" | "payment_proof"; originalName: string },
) {
  const id = newId("ast");
  const storageKey = `private/${opts.workspaceId}/${id}`;
  const full = path.join(ROOT(), storageKey);
  await mkdir(path.dirname(full), { recursive: true });
  await writeFile(full, opts.buf);
  await db.insert(assets).values({
    id,
    workspaceId: opts.workspaceId,
    kind: opts.kind,
    storageKey,
    mime: opts.mime,
    size: opts.buf.length,
    originalName: opts.originalName.replace(/[^\w.\- ]+/g, "_").slice(0, 120) || "file",
    visibility: "private",
  });
  return { id };
}

/** Stores generated or rendered poster images (public, like product photos; ids are unguessable). */
export async function storeImageBytes(db: DB, opts: { workspaceId: string; buf: Buffer; originalName: string; limit?: number }) {
  if (opts.buf.length > (opts.limit ?? IMAGE_LIMIT)) throw new AppError("upload.tooLarge", { mb: Math.round((opts.limit ?? IMAGE_LIMIT) / 1024 / 1024) });
  const mime = detectImageMime(opts.buf);
  if (!mime) throw new AppError("upload.badType");
  const id = newId("ast");
  const storageKey = `public/${opts.workspaceId}/${id}`;
  const full = path.join(ROOT(), storageKey);
  await mkdir(path.dirname(full), { recursive: true });
  await writeFile(full, opts.buf);
  await db.insert(assets).values({ id, workspaceId: opts.workspaceId, kind: "image", storageKey, mime, size: opts.buf.length, originalName: opts.originalName.slice(0, 120), visibility: "public" });
  return { id, mime };
}

export async function storeAsset(
  db: DB,
  opts: { workspaceId: string; file: File; kind: "image" | "digital_file" },
) {
  const buf = Buffer.from(await opts.file.arrayBuffer());
  let mime: string | null;
  let visibility: "public" | "private";
  if (opts.kind === "image") {
    if (buf.length > IMAGE_LIMIT) throw new AppError("upload.tooLarge", { mb: 5 });
    mime = detectImageMime(buf);
    visibility = "public";
  } else {
    if (buf.length > DIGITAL_LIMIT) throw new AppError("upload.tooLarge", { mb: 50 });
    mime = validateDigital(buf, opts.file.type);
    visibility = "private";
  }
  if (!mime) throw new AppError("upload.badType");
  const id = newId("ast");
  const storageKey = `${visibility}/${opts.workspaceId}/${id}`;
  const full = path.join(ROOT(), storageKey);
  await mkdir(path.dirname(full), { recursive: true });
  await writeFile(full, buf);
  const originalName = opts.file.name.replace(/[^\w.\- ]+/g, "_").slice(0, 120) || "file";
  await db.insert(assets).values({
    id,
    workspaceId: opts.workspaceId,
    kind: opts.kind,
    storageKey,
    mime,
    size: buf.length,
    originalName,
    visibility,
  });
  return { id, mime, size: buf.length };
}

export async function readAssetBytes(storageKey: string): Promise<Buffer> {
  const full = path.join(ROOT(), storageKey);
  if (!full.startsWith(ROOT())) throw new Error("bad key");
  return readFile(full);
}
