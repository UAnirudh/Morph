/**
 * Fixed-window rate limiter.
 *
 * In-process and deliberately simple: it protects the single-node deployment
 * this MVP ships on. For multi-region Vercel deployments swap the Map for
 * Upstash/Redis behind the same function signature (documented in
 * docs/ARCHITECTURE.md).
 */
interface Window {
  count: number;
  resetAt: number;
}

const globalForLimiter = globalThis as unknown as { __morphLimiter?: Map<string, Window> };
const buckets = globalForLimiter.__morphLimiter ?? new Map<string, Window>();
globalForLimiter.__morphLimiter = buckets;

export interface RateLimitResult {
  ok: boolean;
  remaining: number;
  retryAfterSeconds: number;
  limit: number;
}

export function rateLimit(
  key: string,
  options: { limit: number; windowMs: number },
): RateLimitResult {
  const now = Date.now();
  const existing = buckets.get(key);
  if (!existing || existing.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + options.windowMs });
    return { ok: true, remaining: options.limit - 1, retryAfterSeconds: 0, limit: options.limit };
  }
  if (existing.count >= options.limit) {
    return {
      ok: false,
      remaining: 0,
      retryAfterSeconds: Math.ceil((existing.resetAt - now) / 1000),
      limit: options.limit,
    };
  }
  existing.count += 1;
  return {
    ok: true,
    remaining: options.limit - existing.count,
    retryAfterSeconds: 0,
    limit: options.limit,
  };
}

export function resetRateLimits(): void {
  buckets.clear();
}
