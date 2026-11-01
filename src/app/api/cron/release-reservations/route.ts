import { getDb } from "@/lib/db";
import { releaseExpiredReservations } from "@/lib/commerce/checkout";
import { safeEqualHex, hmacHex } from "@/lib/crypto";

/** Call periodically (e.g. every 10 min) with header `x-cron-key: <CRON_SECRET>`. */
export async function POST(req: Request) {
  const secret = process.env.CRON_SECRET;
  const given = req.headers.get("x-cron-key") ?? "";
  if (!secret || !safeEqualHex(hmacHex(given, "cron"), hmacHex(secret, "cron"))) return new Response("Forbidden", { status: 403 });
  const released = await releaseExpiredReservations(await getDb());
  return Response.json({ released });
}
