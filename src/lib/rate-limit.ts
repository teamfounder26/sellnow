/**
 * Fixed-window in-memory rate limiter. Adequate for a single instance.
 * For multi-instance deployments replace with a shared store (e.g. Redis) behind the same interface.
 */
const buckets = new Map<string, { count: number; resetAt: number }>();

export function rateLimit(key: string, limit: number, windowMs: number): { ok: boolean; retryAfterMs: number } {
  const now = Date.now();
  const b = buckets.get(key);
  if (!b || b.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { ok: true, retryAfterMs: 0 };
  }
  if (b.count >= limit) return { ok: false, retryAfterMs: b.resetAt - now };
  b.count++;
  return { ok: true, retryAfterMs: 0 };
}

export function __resetRateLimits() {
  buckets.clear();
}
