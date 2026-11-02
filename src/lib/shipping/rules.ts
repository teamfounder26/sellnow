import { and, asc, eq, ne } from "drizzle-orm";
import { z } from "zod";
import type { DB, Tx } from "@/lib/db";
import { shippingRateRules, shippingZones } from "@/lib/db/schema";
import { newId } from "@/lib/ids";
import { AppError } from "@/lib/errors";
import { audit } from "@/lib/audit";
import { REGIONS, inPostcodeRanges, type Destination } from "./zones";

export type Rule = typeof shippingRateRules.$inferSelect;
export type Zone = typeof shippingZones.$inferSelect;
export const MAX_PARCEL_GRAMS = 30_000; // courier/ParcelDaily maximum per parcel

export const ruleSchema = z
  .object({
    name: z.string().trim().min(1).max(80),
    zone: z.string().regex(/^(peninsular|sabah|sarawak|labuan|all|zone:[a-z0-9_]+)$/),
    deliveryType: z.enum(["normal", "cod"]),
    minGrams: z.number().int().min(0).max(MAX_PARCEL_GRAMS),
    maxGrams: z.number().int().min(1).max(MAX_PARCEL_GRAMS),
    feeSen: z.number().int().min(0).max(100_000),
    courier: z.string().max(40).nullable().optional(),
    priority: z.number().int().min(1).max(1000).default(100),
    status: z.enum(["active", "inactive"]).default("active"),
  })
  .refine((r) => r.maxGrams >= r.minGrams, { message: "shipping.badRange", path: ["maxGrams"] });

export const zoneSchema = z.object({
  name: z.string().trim().min(1).max(60),
  states: z.array(z.string()).max(16).default([]),
  postcodeRanges: z.array(z.object({ from: z.string().regex(/^\d{5}$/), to: z.string().regex(/^\d{5}$/) })).max(50).default([]),
});

/** Ranges are inclusive on both ends: [min, max]. 0–500 and 501–1000 don't overlap; 0–500 and 500–1000 do. */
export function rangesOverlap(a: { minGrams: number; maxGrams: number }, b: { minGrams: number; maxGrams: number }) {
  return a.minGrams <= b.maxGrams && b.minGrams <= a.maxGrams;
}

/** An ambiguous rule (same zone, type, courier AND priority, overlapping weights) is refused. */
async function assertNoConflict(db: DB | Tx, workspaceId: string, r: z.infer<typeof ruleSchema>, exceptId?: string) {
  if (r.status !== "active") return;
  const others = await db.query.shippingRateRules.findMany({ where: and(eq(shippingRateRules.workspaceId, workspaceId), eq(shippingRateRules.status, "active"), exceptId ? ne(shippingRateRules.id, exceptId) : undefined) });
  const clash = others.find((o) => o.zone === r.zone && o.deliveryType === r.deliveryType && (o.courier ?? null) === (r.courier ?? null) && o.priority === r.priority && rangesOverlap(o, r));
  if (clash) throw new AppError("shipping.overlap", { name: clash.name });
}

export async function listRules(db: DB | Tx, workspaceId: string) {
  return db.query.shippingRateRules.findMany({ where: eq(shippingRateRules.workspaceId, workspaceId), orderBy: [asc(shippingRateRules.zone), asc(shippingRateRules.deliveryType), asc(shippingRateRules.minGrams)] });
}
export async function listZones(db: DB | Tx, workspaceId: string) {
  return db.query.shippingZones.findMany({ where: eq(shippingZones.workspaceId, workspaceId) });
}

async function assertZone(db: DB | Tx, workspaceId: string, zone: string) {
  if (!zone.startsWith("zone:")) return;
  const z = await db.query.shippingZones.findFirst({ where: and(eq(shippingZones.id, zone.slice(5)), eq(shippingZones.workspaceId, workspaceId)) });
  if (!z) throw new AppError("shipping.unknownZone");
}

export async function saveRule(db: DB, ctx: { workspaceId: string; userId: string }, raw: unknown, id?: string) {
  const r = ruleSchema.parse(raw);
  await assertZone(db, ctx.workspaceId, r.zone);
  await assertNoConflict(db, ctx.workspaceId, r, id);
  if (id) {
    const res = await db.update(shippingRateRules).set({ ...r, courier: r.courier ?? null, updatedAt: new Date() }).where(and(eq(shippingRateRules.id, id), eq(shippingRateRules.workspaceId, ctx.workspaceId))).returning({ id: shippingRateRules.id });
    if (!res.length) throw new AppError("errors.notFound");
  } else {
    id = newId("shr");
    await db.insert(shippingRateRules).values({ id, workspaceId: ctx.workspaceId, ...r, courier: r.courier ?? null });
  }
  await audit(db, { workspaceId: ctx.workspaceId, actorUserId: ctx.userId, action: "shipping.rule_saved", entity: "shipping_rule", entityId: id, data: r });
  return id;
}

export async function deleteRule(db: DB, ctx: { workspaceId: string; userId: string }, id: string) {
  await db.delete(shippingRateRules).where(and(eq(shippingRateRules.id, id), eq(shippingRateRules.workspaceId, ctx.workspaceId)));
  await audit(db, { workspaceId: ctx.workspaceId, actorUserId: ctx.userId, action: "shipping.rule_deleted", entity: "shipping_rule", entityId: id });
}

export async function saveZone(db: DB, ctx: { workspaceId: string; userId: string }, raw: unknown, id?: string) {
  const z = zoneSchema.parse(raw);
  if (!z.states.length && !z.postcodeRanges.length) throw new AppError("shipping.emptyZone");
  if (z.postcodeRanges.some((r) => Number(r.from) > Number(r.to))) throw new AppError("shipping.badPostcodeRange");
  if (id) await db.update(shippingZones).set(z).where(and(eq(shippingZones.id, id), eq(shippingZones.workspaceId, ctx.workspaceId)));
  else {
    id = newId("shz").replace(/[^a-z0-9_]/g, "");
    await db.insert(shippingZones).values({ id, workspaceId: ctx.workspaceId, ...z });
  }
  return id;
}

/** CSV import: name,zone,type,min_g,max_g,fee_rm,priority,courier. Validates every row before saving any. */
export async function importRules(db: DB, ctx: { workspaceId: string; userId: string }, csv: string) {
  const rows = csv.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (rows[0]?.toLowerCase().startsWith("name,")) rows.shift();
  const parsed = rows.map((line, i) => {
    const [name, zone, type, min, max, fee, priority, courier] = line.split(",").map((x) => x.trim());
    const r = ruleSchema.safeParse({ name, zone, deliveryType: type, minGrams: Number(min), maxGrams: Number(max), feeSen: Math.round(Number(fee) * 100), priority: priority ? Number(priority) : 100, courier: courier || null });
    if (!r.success) throw new AppError("shipping.importRow", { row: i + 1 });
    return r.data;
  });
  const ids: string[] = [];
  for (const r of parsed) ids.push(await saveRule(db, ctx, r));
  return ids.length;
}

export function exportRulesCsv(rules: Rule[]) {
  return ["name,zone,type,min_g,max_g,fee_rm,priority,courier,status", ...rules.map((r) => [r.name.replace(/,/g, " "), r.zone, r.deliveryType, r.minGrams, r.maxGrams, (r.feeSen / 100).toFixed(2), r.priority, r.courier ?? "", r.status].join(","))].join("\n");
}

function zoneMatches(rule: Rule, dest: Destination, zones: Zone[]) {
  if (rule.zone === "all") return true;
  if ((REGIONS as string[]).includes(rule.zone)) return rule.zone === dest.region;
  const z = zones.find((x) => `zone:${x.id}` === rule.zone);
  return Boolean(z && (z.states.includes(dest.state) || inPostcodeRanges(dest.postcode, z.postcodeRanges)));
}

/** Specificity: custom zones beat regions beat "all", so a Kuching postcode zone wins over "Sarawak". */
const specificity = (zone: string) => (zone.startsWith("zone:") ? 0 : zone === "all" ? 2 : 1);

export type RateResult = { feeSen: number; rule: { id: string; name: string; zone: string; deliveryType: string; minGrams: number; maxGrams: number; feeSen: number; courier: string | null; priority: number } };

/**
 * Deterministic rule selection: active rules for the delivery type whose zone contains the
 * destination and whose [min,max] grams contain the weight; then lowest priority number, most
 * specific zone, narrowest range, oldest. No match → null (the caller shows "shipping unavailable",
 * never a silent RM0).
 */
export function pickRule(rules: Rule[], zones: Zone[], dest: Destination, weightGrams: number, deliveryType: "normal" | "cod", courier?: string | null): RateResult | null {
  if (weightGrams > MAX_PARCEL_GRAMS) return null;
  const candidates = rules
    .filter((r) => r.status === "active" && r.deliveryType === deliveryType && weightGrams >= r.minGrams && weightGrams <= r.maxGrams && zoneMatches(r, dest, zones) && (!r.courier || !courier || r.courier === courier))
    .sort((a, b) => a.priority - b.priority || specificity(a.zone) - specificity(b.zone) || a.maxGrams - a.minGrams - (b.maxGrams - b.minGrams) || a.createdAt.getTime() - b.createdAt.getTime());
  const r = candidates[0];
  return r ? { feeSen: r.feeSen, rule: { id: r.id, name: r.name, zone: r.zone, deliveryType: r.deliveryType, minGrams: r.minGrams, maxGrams: r.maxGrams, feeSen: r.feeSen, courier: r.courier, priority: r.priority } } : null;
}

export async function hasActiveRules(db: DB | Tx, workspaceId: string) {
  return Boolean(await db.query.shippingRateRules.findFirst({ where: and(eq(shippingRateRules.workspaceId, workspaceId), eq(shippingRateRules.status, "active")) }));
}
