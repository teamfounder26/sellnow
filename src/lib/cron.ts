import { hmacHex, safeEqualHex } from "@/lib/crypto";

/** Scheduled endpoints require header `x-cron-key: <CRON_SECRET>` (compared in constant time). */
export function cronAuthorized(req: Request) {
  const secret = process.env.CRON_SECRET;
  const given = req.headers.get("x-cron-key") ?? "";
  return Boolean(secret) && safeEqualHex(hmacHex(given, "cron"), hmacHex(secret!, "cron"));
}
