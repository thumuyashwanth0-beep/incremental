import { tooMany } from "@/lib/errors";

/**
 * Fixed-window in-memory rate limiter. Fine for a single instance.
 * Before scaling to more than one instance, replace the store with Redis while keeping this signature.
 */
const buckets = new Map<string, { count: number; resetAt: number }>();

export function checkRateLimit(key: string, limit: number, windowSec: number, now = Date.now()): boolean {
  const b = buckets.get(key);
  if (!b || b.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowSec * 1000 });
    if (buckets.size > 50_000) sweep(now);
    return true;
  }
  b.count++;
  return b.count <= limit;
}

export function rateLimit(key: string, limit: number, windowSec: number): void {
  if (!checkRateLimit(key, limit, windowSec)) throw tooMany();
}

function sweep(now: number) {
  for (const [k, b] of buckets) if (b.resetAt <= now) buckets.delete(k);
}
