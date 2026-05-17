import Redis from "ioredis";

declare global {
  var __redis: Redis | undefined;
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
      console.error("[redis] error:", err.message);
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
