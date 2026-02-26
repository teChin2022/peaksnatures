import { NextRequest, NextResponse } from "next/server";

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

interface RateLimitOptions {
  /** Max requests allowed in the window */
  limit: number;
  /** Window duration in milliseconds */
  windowMs: number;
}

/**
 * Simple in-memory rate limiter with automatic cleanup.
 * Works well for single-instance deployments (Vercel single region, etc.).
 * For multi-instance, replace with Redis (e.g. Upstash).
 */
export function createRateLimiter({ limit, windowMs }: RateLimitOptions) {
  const map = new Map<string, RateLimitEntry>();

  // Periodic cleanup every 60s to prevent memory leaks
  let lastCleanup = Date.now();
  const CLEANUP_INTERVAL = 60_000;

  function cleanup() {
    const now = Date.now();
    if (now - lastCleanup < CLEANUP_INTERVAL) return;
    lastCleanup = now;
    for (const [key, entry] of map) {
      if (now > entry.resetAt) map.delete(key);
    }
  }

  /**
   * Check if a request should be rate limited.
   * Returns null if allowed, or a NextResponse(429) if blocked.
   */
  function check(req: NextRequest): NextResponse | null {
    cleanup();

    const ip =
      req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
    const now = Date.now();
    const entry = map.get(ip);

    if (!entry || now > entry.resetAt) {
      map.set(ip, { count: 1, resetAt: now + windowMs });
      return null;
    }

    entry.count++;
    if (entry.count > limit) {
      const retryAfter = Math.ceil((entry.resetAt - now) / 1000);
      return NextResponse.json(
        { error: "Too many requests. Please try again later." },
        {
          status: 429,
          headers: { "Retry-After": String(retryAfter) },
        }
      );
    }

    return null;
  }

  return { check };
}
