import Redis from "ioredis";

declare global {
  var __redis: Redis | undefined;
  var __redisLastErrorLog: number | undefined;
  var __redisFirstAuthLogged: boolean | undefined;
}

const ERROR_LOG_THROTTLE_MS = 60_000;

function isAuthError(message: string): boolean {
  return /NOAUTH|WRONGPASS|invalid password|invalid username/i.test(message);
}

export function getRedis(): Redis | null {
  const url = process.env.REDIS_URL;
  if (!url) return null;

  if (!globalThis.__redis) {
    const client = new Redis(url, {
      lazyConnect: false,
      maxRetriesPerRequest: 1,
      enableOfflineQueue: true,
      connectTimeout: 5000,
    });
    client.on("error", (err) => {
      const msg = err?.message ?? "";
      // ioredis emits an `error` event on every failed connection / reconnect
      // attempt. In serverless (cold start, idle timeout) NOAUTH can flash by
      // a couple of times before AUTH succeeds. Throttle to at most one log
      // per minute so a transient hiccup doesn't fill the function logs, while
      // a sustained misconfiguration is still surfaced.
      const now = Date.now();
      const last = globalThis.__redisLastErrorLog ?? 0;
      if (now - last < ERROR_LOG_THROTTLE_MS) return;
      globalThis.__redisLastErrorLog = now;
      if (isAuthError(msg) && !globalThis.__redisFirstAuthLogged) {
        globalThis.__redisFirstAuthLogged = true;
        console.error(
          `[redis] auth error: ${msg}. If REDIS_URL is correct this is usually transient during reconnect; otherwise fix credentials or unset REDIS_URL.`
        );
        return;
      }
      console.error("[redis] error:", msg);
    });
    globalThis.__redis = client;
  }

  return globalThis.__redis;
}

// Returns the client once the connection is `ready`, or null if the
// handshake doesn't complete within `timeoutMs`. Avoids the cold-start
// race where a command fires before the TCP/TLS handshake finishes.
export async function getReadyRedis(timeoutMs = 2000): Promise<Redis | null> {
  const client = getRedis();
  if (!client) return null;
  if (client.status === "ready") return client;

  return new Promise<Redis | null>((resolve) => {
    let settled = false;
    const finish = (val: Redis | null) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      client.off("ready", onReady);
      resolve(val);
    };
    const onReady = () => finish(client);
    const timer = setTimeout(() => finish(null), timeoutMs);
    client.once("ready", onReady);
  });
}

export function getCacheEnvPrefix(): string {
  return process.env.VERCEL_ENV ?? "development";
}
