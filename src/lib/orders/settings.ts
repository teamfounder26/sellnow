import { eq } from "drizzle-orm";
import { z } from "zod";
import type { DB, Tx } from "@/lib/db";
import { orderSettings, type OrderPaymentSettings } from "@/lib/db/schema";
import { AppError } from "@/lib/errors";
import { audit } from "@/lib/audit";
import { REGIONS, type Region } from "@/lib/shipping/zones";

export const DEFAULT_ORDER_SETTINGS: OrderPaymentSettings = {
  onlineEnabled: true,
  codEnabled: false,
  cod: { minSen: null, maxSen: null, feeSen: 0, regions: ["peninsular"], courierConfirmed: false },
  manualEnabled: false,
  manual: { bankName: "", accountName: "", accountNumber: "", instructions: "", deadlineHours: 24, proofRequired: false },
  freeShippingThresholdSen: null,
  defaultWeightGrams: 500,
};

export async function getOrderSettings(db: DB | Tx, workspaceId: string): Promise<OrderPaymentSettings> {
  const row = await db.query.orderSettings.findFirst({ where: eq(orderSettings.workspaceId, workspaceId) });
  const s = row?.settings;
  return s ? { ...DEFAULT_ORDER_SETTINGS, ...s, cod: { ...DEFAULT_ORDER_SETTINGS.cod, ...s.cod }, manual: { ...DEFAULT_ORDER_SETTINGS.manual, ...s.manual } } : DEFAULT_ORDER_SETTINGS;
}

const money = z.number().int().min(0).max(10_000_000);
export const orderSettingsSchema = z.object({
  onlineEnabled: z.boolean(),
  codEnabled: z.boolean(),
  cod: z.object({
    minSen: money.nullable(),
    maxSen: money.nullable(),
    feeSen: z.number().int().min(0).max(10_000),
    regions: z.array(z.enum(REGIONS as [Region, ...Region[]])).min(1),
    courierConfirmed: z.boolean(),
  }),
  manualEnabled: z.boolean(),
  manual: z.object({
    bankName: z.string().trim().max(80),
    accountName: z.string().trim().max(120),
    accountNumber: z.string().trim().max(30),
    instructions: z.string().trim().max(600),
    deadlineHours: z.number().int().min(1).max(168),
    proofRequired: z.boolean(),
  }),
  freeShippingThresholdSen: money.nullable(),
  defaultWeightGrams: z.number().int().min(1).max(30_000),
});

export async function saveOrderSettings(db: DB, ctx: { workspaceId: string; userId: string }, raw: unknown) {
  const s = orderSettingsSchema.parse(raw) as OrderPaymentSettings;
  if (s.codEnabled && !s.cod.courierConfirmed) throw new AppError("orders.codNeedsCourier");
  if (s.cod.minSen != null && s.cod.maxSen != null && s.cod.minSen > s.cod.maxSen) throw new AppError("orders.codBadRange");
  if (s.manualEnabled && (!s.manual.bankName || !s.manual.accountName || !/^\d{6,20}$/.test(s.manual.accountNumber))) throw new AppError("orders.manualIncomplete");
  if (!s.onlineEnabled && !s.codEnabled && !s.manualEnabled) throw new AppError("orders.noMethod");
  await db
    .insert(orderSettings)
    .values({ workspaceId: ctx.workspaceId, settings: s, updatedBy: ctx.userId })
    .onConflictDoUpdate({ target: orderSettings.workspaceId, set: { settings: s, updatedBy: ctx.userId, updatedAt: new Date() } });
  await audit(db, { workspaceId: ctx.workspaceId, actorUserId: ctx.userId, action: "orders.payment_settings_saved", data: { online: s.onlineEnabled, cod: s.codEnabled, manual: s.manualEnabled } });
}
