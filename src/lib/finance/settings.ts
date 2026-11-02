import { eq } from "drizzle-orm";
import type { DB, Tx } from "@/lib/db";
import { platformSettings } from "@/lib/db/schema";
import { audit } from "@/lib/audit";

/**
 * Platform-wide configuration with safe defaults. Money-moving switches default OFF: payouts,
 * advance (pre-reconciliation) settlement and live Selltro Pay all need an explicit Superadmin change.
 */
export type PlatformConfig = {
  /** Selltro Pay processing fee recovered from the seller per paid order. 0 until the Billplz rate is confirmed. */
  processingFee: { fixedSen: number; bps: number };
  settlement: {
    /** Payments at/after this local time (Asia/Kuala_Lumpur) roll to the next day's cycle. */
    cutoffTime: string; // "HH:MM"
    /** When the daily worker runs (informational for the cron schedule). */
    executionTime: string; // "HH:MM"
    /** Batches need an admin approval before money moves. */
    requireApproval: boolean;
    /** Batches at or above this net amount need a second, different approver. */
    dualApprovalThresholdSen: number;
    /** Pay sellers before Billplz confirms the collection (needs a funded, approved advance arrangement). */
    advanceSettlement: boolean;
  };
  /** Master kill switch for real disbursements. */
  payoutsEnabled: boolean;
  /** Set once the Billplz Enterprise contract/KYC model is confirmed. Live Selltro Pay refuses to run without it. */
  selltroPayLiveApproved: boolean;
  parceldaily: { lowCreditAlertSen: number; marginSen: number };
};

export const DEFAULT_CONFIG: PlatformConfig = {
  processingFee: { fixedSen: 0, bps: 0 },
  settlement: { cutoffTime: "23:59", executionTime: "09:00", requireApproval: true, dualApprovalThresholdSen: 1_000_000, advanceSettlement: false },
  payoutsEnabled: false,
  selltroPayLiveApproved: false,
  parceldaily: { lowCreditAlertSen: 10_000, marginSen: 0 },
};

type Key = keyof PlatformConfig;

export async function getConfig(db: DB | Tx): Promise<PlatformConfig> {
  const rows = await db.select().from(platformSettings);
  const out = structuredClone(DEFAULT_CONFIG) as Record<string, unknown>;
  for (const r of rows) {
    if (!(r.key in out)) continue;
    const def = out[r.key];
    out[r.key] = def && typeof def === "object" && r.value && typeof r.value === "object" ? { ...(def as object), ...(r.value as object) } : r.value;
  }
  return out as PlatformConfig;
}

export async function setConfig<K extends Key>(db: DB, actorUserId: string, key: K, value: PlatformConfig[K]) {
  const prev = (await getConfig(db))[key];
  await db
    .insert(platformSettings)
    .values({ key, value, updatedBy: actorUserId })
    .onConflictDoUpdate({ target: platformSettings.key, set: { value, updatedBy: actorUserId, updatedAt: new Date() } });
  await audit(db, { workspaceId: null, actorUserId, action: "admin.settings.changed", entity: "platform_setting", entityId: key, data: { from: prev as Record<string, unknown>, to: value as Record<string, unknown> } });
}

export async function getSettingRow(db: DB, key: Key) {
  return db.query.platformSettings.findFirst({ where: eq(platformSettings.key, key) });
}
