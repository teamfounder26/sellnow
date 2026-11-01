import { randomBytes } from "node:crypto";

const ALPHABET = "0123456789abcdefghijklmnopqrstuvwxyz";

/** Prefixed, URL-safe random id, e.g. "prd_k3j9…". 16 chars of base36 ≈ 82 bits. */
export function newId(prefix: string): string {
  const bytes = randomBytes(16);
  let out = "";
  for (const b of bytes) out += ALPHABET[b % 36];
  return `${prefix}_${out}`;
}

export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString("base64url");
}

export function slugify(input: string): string {
  return input
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48) || "store";
}
