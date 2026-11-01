import { and, desc, eq, sql, count } from "drizzle-orm";
import { z } from "zod";
import type { DB } from "@/lib/db";
import { customers, leads, orders, products } from "@/lib/db/schema";
import { newId } from "@/lib/ids";
import { AppError } from "@/lib/errors";
import { audit, track, notify } from "@/lib/audit";

export const enquirySchema = z.object({
  name: z.string().trim().min(2, "checkout.nameRequired").max(120),
  email: z.string().trim().toLowerCase().email("checkout.emailInvalid").max(200),
  phone: z.string().trim().max(20).optional().or(z.literal("")),
  message: z.string().trim().max(2000).default(""),
  productId: z.string().optional(),
  consent: z.boolean().default(false),
});

/** Public enquiry / interest form on service, booking, event and membership storefronts. */
export async function captureLead(db: DB, workspaceId: string, raw: z.input<typeof enquirySchema>) {
  const input = enquirySchema.parse(raw);
  if (input.productId) {
    const p = await db.query.products.findFirst({ where: and(eq(products.id, input.productId), eq(products.workspaceId, workspaceId)) });
    if (!p) throw new AppError("errors.notFound");
  }
  const [cust] = await db
    .insert(customers)
    .values({ id: newId("cus"), workspaceId, name: input.name, email: input.email, phone: input.phone || null, marketingConsent: input.consent, source: "enquiry_form" })
    .onConflictDoUpdate({ target: [customers.workspaceId, customers.email], set: { name: input.name } })
    .returning();
  const id = newId("lead");
  await db.insert(leads).values({ id, workspaceId, customerId: cust!.id, productId: input.productId ?? null, message: input.message, source: "enquiry_form" });
  await notify(db, workspaceId, "lead.new", { leadId: id, productId: input.productId ?? null });
  await audit(db, { workspaceId, action: "lead.captured", entity: "lead", entityId: id });
  await track(db, "lead_captured", { workspaceId });
  return id;
}

export async function listCustomers(db: DB, workspaceId: string) {
  return db
    .select({
      customer: customers,
      orders: sql<number>`(select count(*)::int from ${orders} o where o.customer_id = ${customers.id} and o.payment_status = 'PAID' and o.is_test = false)`,
      spentSen: sql<number>`(select coalesce(sum(o.total_sen - o.refunded_sen),0)::int from ${orders} o where o.customer_id = ${customers.id} and o.payment_status in ('PAID','PARTIALLY_REFUNDED') and o.is_test = false)`,
      leads: sql<number>`(select count(*)::int from ${leads} l where l.customer_id = ${customers.id})`,
    })
    .from(customers)
    .where(eq(customers.workspaceId, workspaceId))
    .orderBy(desc(customers.createdAt))
    .limit(500);
}

export async function getCustomerTimeline(db: DB, workspaceId: string, customerId: string) {
  const c = await db.query.customers.findFirst({ where: and(eq(customers.id, customerId), eq(customers.workspaceId, workspaceId)) });
  if (!c) throw new AppError("errors.notFound");
  const [os, ls] = await Promise.all([
    db.query.orders.findMany({ where: and(eq(orders.customerId, c.id), eq(orders.workspaceId, workspaceId)), orderBy: desc(orders.createdAt) }),
    db.query.leads.findMany({ where: and(eq(leads.customerId, c.id), eq(leads.workspaceId, workspaceId)), orderBy: desc(leads.createdAt) }),
  ]);
  const events = [
    ...os.map((o) => ({ at: o.createdAt, kind: "order" as const, order: o })),
    ...ls.map((l) => ({ at: l.createdAt, kind: "lead" as const, lead: l })),
  ].sort((a, b) => b.at.getTime() - a.at.getTime());
  return { customer: c, events };
}

export async function listLeads(db: DB, workspaceId: string) {
  return db
    .select({ lead: leads, customer: { id: customers.id, name: customers.name, email: customers.email, phone: customers.phone } })
    .from(leads)
    .innerJoin(customers, eq(customers.id, leads.customerId))
    .where(eq(leads.workspaceId, workspaceId))
    .orderBy(desc(leads.createdAt))
    .limit(500);
}

export async function updateLead(db: DB, ctx: { workspaceId: string; userId: string }, leadId: string, patch: { status?: "new" | "contacted" | "qualified" | "won" | "lost"; humanTakeover?: boolean }) {
  const r = await db.update(leads).set(patch).where(and(eq(leads.id, leadId), eq(leads.workspaceId, ctx.workspaceId))).returning({ id: leads.id });
  if (!r.length) throw new AppError("errors.notFound");
  await audit(db, { workspaceId: ctx.workspaceId, actorUserId: ctx.userId, action: "lead.updated", entity: "lead", entityId: leadId, data: patch });
}

export async function setOptOut(db: DB, workspaceId: string, customerId: string, optedOut: boolean) {
  await db
    .update(customers)
    .set({ optedOutAt: optedOut ? new Date() : null, ...(optedOut ? { marketingConsent: false } : {}) })
    .where(and(eq(customers.id, customerId), eq(customers.workspaceId, workspaceId)));
}

export async function countLeads(db: DB, workspaceId: string) {
  const [r] = await db.select({ n: count() }).from(leads).where(eq(leads.workspaceId, workspaceId));
  return r?.n ?? 0;
}
