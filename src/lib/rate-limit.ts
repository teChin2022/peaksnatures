import { NextRequest, NextResponse } from "next/server";
import { getReadyRedis, getCacheEnvPrefix } from "@/lib/redis";

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

interface RateLimitOptions {
  /** Max requests allowed in the window */
  limit: number;
  /** Window duration in milliseconds */
  windowMs: number;
  /**
   * Optional key derivation. Receives the request and returns a string used as
   * the rate-limit bucket. Defaults to the client IP from `x-forwarded-for`.
   * Can be async (e.g. when it needs to read the request body).
   */
  key?: (req: NextRequest) => string | Promise<string>;
  /**
   * Optional namespace used in the Redis key and fallback log message.
   * Lets multiple limiters share Redis without colliding.
   */
  name?: string;
}

function defaultKey(req: NextRequest): string {
  return req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
}

function tooManyResponse(retryAfterSeconds: number): NextResponse {
  return NextResponse.json(
    { error: "Too many requests. Please try again later." },
    {
      status: 429,
      headers: { "Retry-After": String(retryAfterSeconds) },
    }
  );
}

// Process-wide kill switch shared across all limiters created in this process.
// Once a fatal Redis error (bad auth, host unreachable) is observed, we stop
// attempting Redis commands so the shared client's error handler in redis.ts
// doesn't get a NOAUTH / ECONNREFUSED on every request.
let redisProcessDisabled = false;
let redisProcessDisabledLogged = false;

function isFatalRedisError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err ?? "");
  return /NOAUTH|WRONGPASS|ENOTFOUND|ECONNREFUSED|EHOSTUNREACH|ETIMEDOUT|invalid password/i.test(
    msg
  );
}

function disableRedisForProcess(name: string, reason: string, err?: unknown) {
  redisProcessDisabled = true;
  if (redisProcessDisabledLogged) return;
  redisProcessDisabledLogged = true;
  console.warn(
    `[rate-limit:${name}] Redis disabled for this process (${reason}). Falling back to in-memory limiter. Fix REDIS_URL or unset it to silence this.`,
    err instanceof Error ? err.message : err ?? ""
  );
}

/**
 * Rate limiter with optional Redis backend.
 *
 * - When `REDIS_URL` is set and reachable, uses Redis `INCR` + `PEXPIRE NX` so
 *   the limit is enforced consistently across instances/regions.
 * - When Redis is unset, unreachable, or errors on any command, falls through
 *   to the in-memory Map below (per-process). This is the existing behavior
 *   and is required to keep the limiter "fail-open as upgrade only" — Redis
 *   outages must never block legitimate traffic.
 *
 * The fallback notice is logged at most once per process to avoid log spam.
 */
export function createRateLimiter({
  limit,
  windowMs,
  key,
  name = "default",
}: RateLimitOptions) {
  const map = new Map<string, RateLimitEntry>();
  let fallbackLogged = false;

  // Periodic cleanup every 60s to prevent memory leaks
  let lastCleanup = Date.now();
  const CLEANUP_INTERVAL = 60_000;

  function cleanup() {
    const now = Date.now();
    if (now - lastCleanup < CLEANUP_INTERVAL) return;
    lastCleanup = now;
    for (const [k, entry] of map) {
      if (now > entry.resetAt) map.delete(k);
    }
  }

  function logFallback(reason: string, err?: unknown) {
    if (fallbackLogged) return;
    fallbackLogged = true;
    console.warn(
      `[rate-limit:${name}] Redis unavailable (${reason}) — using in-memory fallback for this process.`,
      err ?? ""
    );
  }

  function checkInMemory(bucket: string): NextResponse | null {
    cleanup();
    const now = Date.now();
    const entry = map.get(bucket);

    if (!entry || now > entry.resetAt) {
      map.set(bucket, { count: 1, resetAt: now + windowMs });
      return null;
    }

    entry.count++;
    if (entry.count > limit) {
      const retryAfter = Math.ceil((entry.resetAt - now) / 1000);
      return tooManyResponse(retryAfter);
    }
    return null;
  }

  async function checkRedis(bucket: string): Promise<NextResponse | null | "fallback"> {
    const client = await getReadyRedis().catch(() => null);
    if (!client) {
      logFallback("client not ready");
      return "fallback";
    }
    const redisKey = `rl:${getCacheEnvPrefix()}:${name}:${bucket}`;
    try {
      // INCR creates the key at 1 if absent. PEXPIRE with NX sets the TTL only
      // on the first hit, so the window starts when the first request arrives.
      const pipeline = client.pipeline();
      pipeline.incr(redisKey);
      pipeline.pexpire(redisKey, windowMs, "NX");
      pipeline.pttl(redisKey);
      const results = await pipeline.exec();
      if (!results) {
        logFallback("pipeline returned no results");
        return "fallback";
      }
      const [incrErr, count] = results[0] ?? [];
      const [, ttl] = results[2] ?? [];
      if (incrErr) {
        if (isFatalRedisError(incrErr)) {
          disableRedisForProcess(name, "INCR fatal", incrErr);
        } else {
          logFallback("INCR error", incrErr);
        }
        return "fallback";
      }
      const countNum = typeof count === "number" ? count : Number(count);
      if (countNum > limit) {
        const ttlNum = typeof ttl === "number" ? ttl : Number(ttl);
        const retryAfter = ttlNum > 0 ? Math.ceil(ttlNum / 1000) : Math.ceil(windowMs / 1000);
        return tooManyResponse(retryAfter);
      }
      return null;
    } catch (err) {
      if (isFatalRedisError(err)) {
        disableRedisForProcess(name, "command threw fatal", err);
      } else {
        logFallback("command threw", err);
      }
      return "fallback";
    }
  }

  async function check(req: NextRequest): Promise<NextResponse | null> {
    const bucket = await Promise.resolve((key ?? defaultKey)(req));

    if (process.env.REDIS_URL && !redisProcessDisabled) {
      const redisResult = await checkRedis(bucket);
      if (redisResult !== "fallback") return redisResult;
    }

    return checkInMemory(bucket);
  }

  return { check };
}
