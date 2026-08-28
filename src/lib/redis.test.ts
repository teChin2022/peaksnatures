import { EventEmitter } from "node:events";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

class FakeRedis extends EventEmitter {
  status = "connecting";
  constructor(
    public url: string,
    public options: Record<string, unknown>,
  ) {
    super();
  }
}

const { RedisCtor } = vi.hoisted(() => ({ RedisCtor: vi.fn() }));
vi.mock("ioredis", () => ({ default: RedisCtor }));

type RedisModule = typeof import("@/lib/redis");

/** Each case starts with no cached client and no throttle state. */
async function loadRedis(): Promise<RedisModule> {
  vi.resetModules();
  globalThis.__redis = undefined;
  globalThis.__redisLastErrorLog = undefined;
  globalThis.__redisFirstAuthLogged = undefined;
  return import("@/lib/redis");
}

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  // Must be a `function`, not an arrow: Vitest requires a constructible
  // implementation for a mock invoked with `new`.
  RedisCtor.mockImplementation(function (this: unknown, url: string, options: Record<string, unknown>) {
    return new FakeRedis(url, options);
  });
  vi.stubEnv("REDIS_URL", "redis://localhost:6379");
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.useRealTimers();
  globalThis.__redis = undefined;
  globalThis.__redisLastErrorLog = undefined;
  globalThis.__redisFirstAuthLogged = undefined;
});

describe("getRedis", () => {
  it("returns null when no Redis is configured, so callers fall back", async () => {
    vi.stubEnv("REDIS_URL", "");
    const { getRedis } = await loadRedis();
    expect(getRedis()).toBeNull();
    expect(RedisCtor).not.toHaveBeenCalled();
  });

  it("connects with a bounded retry and connect timeout", async () => {
    const { getRedis } = await loadRedis();
    getRedis();

    expect(RedisCtor).toHaveBeenCalledWith("redis://localhost:6379", {
      lazyConnect: false,
      maxRetriesPerRequest: 1,
      enableOfflineQueue: true,
      connectTimeout: 5000,
    });
  });

  it("reuses one client across calls rather than reconnecting", async () => {
    const { getRedis } = await loadRedis();
    expect(getRedis()).toBe(getRedis());
    expect(RedisCtor).toHaveBeenCalledTimes(1);
  });

  describe("error logging", () => {
    it("logs a connection error", async () => {
      const { getRedis } = await loadRedis();
      getRedis()!.emit("error", new Error("ECONNRESET"));
      expect(console.error).toHaveBeenCalledWith("[redis] error:", "ECONNRESET");
    });

    it("explains an auth error the first time it sees one", async () => {
      const { getRedis } = await loadRedis();
      getRedis()!.emit("error", new Error("NOAUTH Authentication required"));

      expect(console.error).toHaveBeenCalledTimes(1);
      expect(vi.mocked(console.error).mock.calls[0][0]).toMatch(/auth error[\s\S]*transient during reconnect/);
    });

    it("throttles to at most one log a minute so a flapping connection cannot spam", async () => {
      vi.useFakeTimers();
      const { getRedis } = await loadRedis();
      const client = getRedis()!;

      client.emit("error", new Error("ECONNRESET"));
      client.emit("error", new Error("ECONNRESET"));
      client.emit("error", new Error("ECONNRESET"));
      expect(console.error).toHaveBeenCalledTimes(1);

      vi.advanceTimersByTime(60_001);
      client.emit("error", new Error("ECONNRESET"));
      expect(console.error).toHaveBeenCalledTimes(2);
    });

    it("uses the plain form for a second auth error", async () => {
      vi.useFakeTimers();
      const { getRedis } = await loadRedis();
      const client = getRedis()!;

      client.emit("error", new Error("WRONGPASS invalid"));
      vi.advanceTimersByTime(60_001);
      client.emit("error", new Error("WRONGPASS invalid"));

      expect(console.error).toHaveBeenLastCalledWith("[redis] error:", "WRONGPASS invalid");
    });

    it("survives an error with no message", async () => {
      const { getRedis } = await loadRedis();
      getRedis()!.emit("error", {});
      expect(console.error).toHaveBeenCalledWith("[redis] error:", "");
    });
  });
});

describe("getReadyRedis", () => {
  it("returns null when no Redis is configured", async () => {
    vi.stubEnv("REDIS_URL", "");
    const { getReadyRedis } = await loadRedis();
    await expect(getReadyRedis()).resolves.toBeNull();
  });

  it("returns a client that is already connected without waiting", async () => {
    const { getRedis, getReadyRedis } = await loadRedis();
    const client = getRedis()!;
    client.status = "ready";

    await expect(getReadyRedis()).resolves.toBe(client);
  });

  it("waits for the handshake to finish, avoiding the cold-start race", async () => {
    const { getRedis, getReadyRedis } = await loadRedis();
    const client = getRedis()!;

    const pending = getReadyRedis(2000);
    client.emit("ready");

    await expect(pending).resolves.toBe(client);
  });

  it("gives up after the timeout so a caller is never left hanging", async () => {
    vi.useFakeTimers();
    const { getReadyRedis } = await loadRedis();

    const pending = getReadyRedis(2000);
    await vi.advanceTimersByTimeAsync(2001);

    await expect(pending).resolves.toBeNull();
  });

  it("stops listening once it has an answer", async () => {
    vi.useFakeTimers();
    const { getRedis, getReadyRedis } = await loadRedis();
    const client = getRedis()!;

    const pending = getReadyRedis(2000);
    client.emit("ready");
    await expect(pending).resolves.toBe(client);

    expect(client.listenerCount("ready")).toBe(0);
    // A later timeout must not resolve the already-settled promise again.
    await vi.advanceTimersByTimeAsync(3000);
  });
});

describe("getCacheEnvPrefix", () => {
  it("namespaces cache keys by deployment environment", async () => {
    vi.stubEnv("VERCEL_ENV", "preview");
    const { getCacheEnvPrefix } = await loadRedis();
    expect(getCacheEnvPrefix()).toBe("preview");
  });

  it("falls back to development when running outside Vercel", async () => {
    vi.stubEnv("VERCEL_ENV", undefined);
    const { getCacheEnvPrefix } = await loadRedis();
    expect(getCacheEnvPrefix()).toBe("development");
  });
});
