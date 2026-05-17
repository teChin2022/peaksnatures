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
      enableOfflineQueue: false,
      connectTimeout: 2000,
    });
    client.on("error", (err) => {
      console.error("[redis] error:", err.message);
    });
    globalThis.__redis = client;
  }

  return globalThis.__redis;
}

export function getCacheEnvPrefix(): string {
  return process.env.VERCEL_ENV ?? "development";
}
