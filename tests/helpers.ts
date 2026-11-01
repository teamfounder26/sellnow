import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import path from "node:path";
import { eq } from "drizzle-orm";
import * as schema from "@/lib/db/schema";
import { __setDbForTests, type DB } from "@/lib/db";
import { registerUser } from "@/lib/auth/service";
import { createWorkspace } from "@/lib/workspace/service";
import { createProduct, type ProductInput } from "@/lib/products/service";
import { connectPaymentProvider } from "@/lib/payments/integrations";
import { generateStorefrontDraft, saveDraft, getStorefront } from "@/lib/storefront/service";
import { __setAIProviderForTests, type AIProvider } from "@/lib/ai/provider";

export async function makeDb(): Promise<DB> {
  const client = new PGlite();
  const db = drizzle(client, { schema }) as unknown as DB;
  await migrate(db as never, { migrationsFolder: path.resolve(import.meta.dirname, "../drizzle") });
  __setDbForTests(db);
  return db;
}

let seq = 0;
export async function makeSeller(db: DB, opts: { verified?: boolean } = {}) {
  seq++;
  const user = await registerUser(db, { name: `Seller ${seq}`, email: `seller${seq}-${Date.now()}@example.com`, password: "password123" });
  if (opts.verified !== false) await db.update(schema.users).set({ emailVerifiedAt: new Date() }).where(eq(schema.users.id, user.id));
  const workspaceId = await createWorkspace(db, user.id, `Kedai ${seq}`);
  return { userId: user.id, workspaceId, ctx: { db, workspaceId, userId: user.id, locale: "ms" as const } };
}

export const sambal: ProductInput = {
  type: "physical",
  name: "Sambal Garing Mak Teh",
  description: "Sambal homemade 200g",
  price: "19.90",
  fulfillment: "shipping",
  shippingFlat: "8.00",
  trackStock: true,
  stock: "5",
  status: "active",
};

/** Seller with an active product, a test payment gateway and a published storefront. */
export async function makeLiveStore(db: DB, product: ProductInput = sambal) {
  __setAIProviderForTests(null);
  const s = await makeSeller(db);
  const productId = await createProduct(s.ctx, product);
  await connectPaymentProvider(db, s, "test", { mode: "test" });
  await generateStorefrontDraft(s.ctx, { useAI: false });
  const sf = (await getStorefront(db, s.workspaceId))!;
  await saveDraft(s.ctx, {
    content: { ...sf.draftContent, policies: { contactEmail: "seller@example.com", refund: "7 hari", shipping: "2-3 hari bekerja" } },
    theme: sf.draftTheme,
  });
  return { ...s, productId, slug: sf.slug };
}

export function fakeProvider(handler: (req: { system: string; prompt: string }) => unknown): AIProvider {
  return {
    name: "fake",
    model: "fake-model",
    async generateStructured(req) {
      const data = handler(req);
      if (data instanceof Error) throw data;
      return { data: data as never, usage: { inputTokens: 10, outputTokens: 20 }, model: "fake-model" };
    },
  };
}
