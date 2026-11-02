import { getDb } from "@/lib/db";
import { fundingSnapshots } from "@/lib/db/schema";
import { cronAuthorized } from "@/lib/cron";
import { ParcelDailyAdapter, parcelDailyConfigured } from "@/lib/couriers/parceldaily";
import { getConfig } from "@/lib/finance/settings";
import { clearAlert, raiseAlert } from "@/lib/admin/alerts";
import { newId } from "@/lib/ids";

/** Hourly: read ParcelDaily credit (never tops up) and alert below the configured threshold. */
export async function POST(req: Request) {
  if (!cronAuthorized(req)) return new Response("Forbidden", { status: 403 });
  if (!parcelDailyConfigured()) return Response.json({ skipped: "parceldaily_not_configured" });
  const db = await getDb();
  try {
    const credit = await new ParcelDailyAdapter().balanceSen();
    await db.insert(fundingSnapshots).values({ id: newId("fnd"), source: "parceldaily_credit", amountSen: credit, ok: true });
    const { parceldaily } = await getConfig(db);
    if (credit < parceldaily.lowCreditAlertSen) await raiseAlert(db, { kind: "courier.parceldaily_low", severity: "warning", message: `ParcelDaily credit is low: RM${(credit / 100).toFixed(2)}.`, dedupeKey: "parceldaily:low", link: "/admin/couriers" });
    else await clearAlert(db, "parceldaily:low");
    return Response.json({ creditSen: credit });
  } catch (e) {
    await db.insert(fundingSnapshots).values({ id: newId("fnd"), source: "parceldaily_credit", amountSen: null, ok: false, error: String(e).slice(0, 300) });
    await raiseAlert(db, { kind: "courier.parceldaily_down", severity: "critical", message: "ParcelDaily account check failed.", dedupeKey: "parceldaily:down", link: "/admin/health" });
    return Response.json({ error: "check_failed" }, { status: 502 });
  }
}
