import { defineJob, type StageContext } from "@/lib/jobs/runner";
import { bulkPushOne } from "./service";

export type BulkPushInput = { orderIds: string[]; service: string; base?: string };

/**
 * Bulk "Push to Courier" in the background. Each order is booked through the same idempotent
 * single-push path (create → credit check → checkout), so a resumed or retried job skips orders
 * that already have a live shipment and never books twice. Results are kept per order.
 */
export const courierBulkJob = defineJob({
  kind: "courier.bulkPush",
  leaseSeconds: 600,
  stages: [
    {
      key: "push",
      run: async ({ db, job }: StageContext) => {
        const input = job.input as BulkPushInput;
        const ctx = { db, workspaceId: job.workspaceId, userId: job.userId ?? "" };
        const results = [];
        for (const orderId of input.orderIds) results.push(await bulkPushOne(ctx, orderId, input.service, input.base));
        return {
          results,
          total: results.length,
          succeeded: results.filter((r) => r.ok).length,
          failed: results.filter((r) => !r.ok).length,
          courierChargesSen: results.reduce((a, r) => a + (r.ok && "costSen" in r ? (r.costSen ?? 0) : 0), 0),
        };
      },
    },
  ],
});
