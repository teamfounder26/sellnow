import { describe, it, expect, beforeAll } from "vitest";
import { makeDb, makeSeller } from "./helpers";
import type { DB } from "@/lib/db";
import { authenticate, createSession, resolveSession, assertMember, registerUser, destroySession, createEmailVerification, consumeEmailVerification } from "@/lib/auth/service";
import { workspaceMembers, users } from "@/lib/db/schema";
import { listProducts, createProduct, getProduct } from "@/lib/products/service";
import { eq } from "drizzle-orm";
import { verifyPassword, hashPassword } from "@/lib/crypto";

let db: DB;
beforeAll(async () => {
  db = await makeDb();
});

describe("authentication", () => {
  it("hashes passwords with scrypt and verifies them", async () => {
    const h = await hashPassword("rahsia-123");
    expect(h.startsWith("scrypt$")).toBe(true);
    expect(await verifyPassword("rahsia-123", h)).toBe(true);
    expect(await verifyPassword("wrong", h)).toBe(false);
  });

  it("registers, authenticates and resolves sessions; rejects bad credentials", async () => {
    const u = await registerUser(db, { name: "Aminah", email: "Aminah@Example.com", password: "password123" });
    expect(u.email).toBe("aminah@example.com");
    await expect(registerUser(db, { name: "Dup", email: "aminah@example.com", password: "password123" })).rejects.toMatchObject({ code: "auth.emailTaken" });
    await expect(authenticate(db, "aminah@example.com", "nope-nope")).rejects.toMatchObject({ code: "auth.invalidCredentials" });
    const user = await authenticate(db, "aminah@example.com", "password123");
    const { token } = await createSession(db, user.id);
    expect((await resolveSession(db, token))?.id).toBe(user.id);
    expect(await resolveSession(db, "forged-token")).toBeNull();
    await destroySession(db, token);
    expect(await resolveSession(db, token)).toBeNull();
  });

  it("verifies email with single-use tokens", async () => {
    const u = await registerUser(db, { name: "Verify", email: "verify@example.com", password: "password123" });
    const token = await createEmailVerification(db, u.id);
    expect(await consumeEmailVerification(db, "bad")).toBe(false);
    expect(await consumeEmailVerification(db, token)).toBe(true);
    expect(await consumeEmailVerification(db, token)).toBe(false);
    const row = await db.query.users.findFirst({ where: eq(users.id, u.id) });
    expect(row?.emailVerifiedAt).toBeTruthy();
  });
});

describe("tenant isolation & roles", () => {
  it("denies cross-tenant access on the server", async () => {
    const a = await makeSeller(db);
    const b = await makeSeller(db);
    await expect(assertMember(db, a.userId, b.workspaceId)).rejects.toMatchObject({ code: "errors.forbidden" });
    const pid = await createProduct(b.ctx, { type: "digital", name: "Ebook B", price: "10.00", status: "draft" });
    // Workspace A cannot read workspace B's product even with its id.
    await expect(getProduct(db, a.workspaceId, pid)).rejects.toMatchObject({ code: "errors.notFound" });
    expect((await listProducts(db, a.workspaceId)).map((p) => p.id)).not.toContain(pid);
  });

  it("enforces minimum roles", async () => {
    const owner = await makeSeller(db);
    const viewer = await registerUser(db, { name: "Viewer", email: `viewer-${Date.now()}@example.com`, password: "password123" });
    await db.insert(workspaceMembers).values({ workspaceId: owner.workspaceId, userId: viewer.id, role: "viewer" });
    await expect(assertMember(db, viewer.id, owner.workspaceId, "viewer")).resolves.toMatchObject({ role: "viewer" });
    await expect(assertMember(db, viewer.id, owner.workspaceId, "editor")).rejects.toMatchObject({ code: "errors.permissionDenied" });
    await expect(assertMember(db, owner.userId, owner.workspaceId, "owner")).resolves.toMatchObject({ role: "owner" });
  });
});
