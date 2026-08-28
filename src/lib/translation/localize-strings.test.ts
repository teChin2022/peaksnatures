import { beforeEach, describe, expect, it, vi } from "vitest";
import { localizeStrings } from "@/lib/translation/localize-strings";

const { getRedis, getReadyRedis, getCacheEnvPrefix, generateObject } = vi.hoisted(() => ({
  getRedis: vi.fn(),
  getReadyRedis: vi.fn(),
  getCacheEnvPrefix: vi.fn(() => "test"),
  generateObject: vi.fn(),
}));

vi.mock("@/lib/redis", () => ({ getRedis, getReadyRedis, getCacheEnvPrefix }));
vi.mock("ai", () => ({ generateObject }));
vi.mock("@ai-sdk/google", () => ({ google: vi.fn(() => "gemini-model") }));

/** A Redis stand-in whose GET result and SCAN keys are controllable. */
function redisClient(getResult: string | null = null, scanKeys: string[][] = [[]]) {
  return {
    get: vi.fn<(key: string) => Promise<string | null>>(() => Promise.resolve(getResult)),
    set: vi.fn(() => Promise.resolve("OK")),
    del: vi.fn(() => Promise.resolve(1)),
    scanStream: vi.fn(() => ({
      async *[Symbol.asyncIterator]() {
        for (const batch of scanKeys) yield batch;
      },
    })),
  };
}

const strings = { greeting: "สวัสดี", note: "ทดสอบ", missing: null };

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  getReadyRedis.mockResolvedValue(null);
  getRedis.mockReturnValue(null);
  generateObject.mockResolvedValue({ object: { greeting: "Hello", note: "Test", missing: null } });
});

describe("localizeStrings", () => {
  it("returns Thai content untouched without calling anything", async () => {
    await expect(localizeStrings("ns", strings, "th")).resolves.toBe(strings);
    expect(getReadyRedis).not.toHaveBeenCalled();
    expect(generateObject).not.toHaveBeenCalled();
  });

  it("returns early when there is nothing worth translating", async () => {
    const empties: Record<string, string | null>[] = [{ a: null }, { a: "" }, { a: "   " }, {}];
    for (const empty of empties) {
      await expect(localizeStrings("ns", empty, "en")).resolves.toBe(empty);
    }
    expect(generateObject).not.toHaveBeenCalled();
  });

  it("translates through Gemini and merges the result", async () => {
    await expect(localizeStrings("ns", strings, "en")).resolves.toEqual({
      greeting: "Hello",
      note: "Test",
      missing: null,
    });
    expect(generateObject).toHaveBeenCalledWith(
      expect.objectContaining({ model: "gemini-model", prompt: expect.stringContaining("สวัสดี") }),
    );
  });

  it("keeps the original text when Gemini fails", async () => {
    generateObject.mockRejectedValue(new Error("quota exceeded"));
    await expect(localizeStrings("ns", strings, "en")).resolves.toBe(strings);
    expect(console.error).toHaveBeenCalled();
  });

  it("only overwrites keys the caller asked about", async () => {
    generateObject.mockResolvedValue({ object: { greeting: "Hello", surprise: "Extra" } });
    const result = await localizeStrings("ns", { greeting: "สวัสดี" }, "en");
    expect(result).toEqual({ greeting: "Hello" });
  });

  it("leaves a key alone when the translation omits it", async () => {
    generateObject.mockResolvedValue({ object: { greeting: "Hello" } });
    const result = await localizeStrings("ns", { greeting: "สวัสดี", note: "ทดสอบ" }, "en");
    expect(result).toEqual({ greeting: "Hello", note: "ทดสอบ" });
  });

  describe("caching", () => {
    it("serves a cached translation without calling Gemini", async () => {
      getReadyRedis.mockResolvedValue(
        redisClient(JSON.stringify({ greeting: "Hello", note: "Test", missing: null })),
      );

      await expect(localizeStrings("ns", strings, "en")).resolves.toEqual({
        greeting: "Hello",
        note: "Test",
        missing: null,
      });
      expect(generateObject).not.toHaveBeenCalled();
    });

    it("namespaces the cache key by environment, locale and content", async () => {
      const client = redisClient();
      getReadyRedis.mockResolvedValue(client);

      await localizeStrings("email:homestay:h-1", strings, "en");

      expect(client.get).toHaveBeenCalledWith(
        expect.stringMatching(/^test:strings:i18n:en:email:homestay:h-1:[0-9a-f]{16}$/),
      );
    });

    it("gives the same key for the same content and a different one otherwise", async () => {
      const client = redisClient();
      getReadyRedis.mockResolvedValue(client);

      await localizeStrings("ns", { a: "หนึ่ง" }, "en");
      await localizeStrings("ns", { a: "หนึ่ง" }, "en");
      await localizeStrings("ns", { a: "สอง" }, "en");

      const [first, second, third] = client.get.mock.calls.map((c) => c[0]);
      expect(first).toBe(second);
      expect(third).not.toBe(first);
    });

    it("translates afresh when the cached value has the wrong shape", async () => {
      getReadyRedis.mockResolvedValue(redisClient(JSON.stringify({ greeting: 42 })));
      await localizeStrings("ns", strings, "en");
      expect(generateObject).toHaveBeenCalled();
    });

    it("translates afresh when the cached value is not JSON", async () => {
      getReadyRedis.mockResolvedValue(redisClient("not json"));
      await localizeStrings("ns", strings, "en");
      expect(generateObject).toHaveBeenCalled();
      expect(console.error).toHaveBeenCalled();
    });

    it("writes the translation and evicts superseded entries", async () => {
      const client = redisClient(null, [["test:strings:i18n:en:ns:oldhash", "test:strings:i18n:en:ns:older"]]);
      getRedis.mockReturnValue(client);

      await localizeStrings("ns", strings, "en");

      expect(client.del).toHaveBeenCalledWith("test:strings:i18n:en:ns:oldhash", "test:strings:i18n:en:ns:older");
      expect(client.set).toHaveBeenCalledWith(
        expect.stringContaining("test:strings:i18n:en:ns:"),
        JSON.stringify({ greeting: "Hello", note: "Test", missing: null }),
        "EX",
        60 * 60 * 24 * 365,
      );
    });

    it("does not delete anything when there is nothing stale", async () => {
      const client = redisClient(null, [[]]);
      getRedis.mockReturnValue(client);

      await localizeStrings("ns", strings, "en");

      expect(client.del).not.toHaveBeenCalled();
      expect(client.set).toHaveBeenCalled();
    });

    it("still returns a translation when Redis is unavailable", async () => {
      getReadyRedis.mockResolvedValue(null);
      getRedis.mockReturnValue(null);

      await expect(localizeStrings("ns", strings, "en")).resolves.toMatchObject({ greeting: "Hello" });
    });

    it("still returns a translation when the cache read throws", async () => {
      const client = redisClient();
      client.get.mockRejectedValue(new Error("connection reset"));
      getReadyRedis.mockResolvedValue(client);

      await expect(localizeStrings("ns", strings, "en")).resolves.toMatchObject({ greeting: "Hello" });
      expect(console.error).toHaveBeenCalled();
    });

    it("still returns a translation when the cache write throws", async () => {
      const client = redisClient();
      client.set.mockRejectedValue(new Error("read only replica"));
      getRedis.mockReturnValue(client);

      await expect(localizeStrings("ns", strings, "en")).resolves.toMatchObject({ greeting: "Hello" });
      expect(console.error).toHaveBeenCalled();
    });
  });
});
