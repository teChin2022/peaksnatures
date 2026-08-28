import { beforeEach, describe, expect, it, vi } from "vitest";
import { localizeHomestay } from "@/lib/translation/translate-homestay";
import type { TranslationPayload } from "@/lib/translation/types";
import { makeHomestay, makeHost, makeRoom } from "../../../test/fixtures/db";
import type {
  Review,
  RoomGuestPricing,
  RoomOption,
  RoomSeasonalPrice,
  RoomSpecialPrice,
} from "@/types/database";

const { getRedis, getReadyRedis, getCacheEnvPrefix, generateObject } = vi.hoisted(() => ({
  getRedis: vi.fn(),
  getReadyRedis: vi.fn(),
  getCacheEnvPrefix: vi.fn(() => "test"),
  generateObject: vi.fn(),
}));

vi.mock("@/lib/redis", () => ({ getRedis, getReadyRedis, getCacheEnvPrefix }));
vi.mock("ai", () => ({ generateObject }));
vi.mock("@ai-sdk/google", () => ({ google: vi.fn(() => "gemini-model") }));

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

const input = () => ({
  homestay: makeHomestay({
    name: "บ้านพักดอยอินทนนท์",
    tagline: "สงบ ร่มรื่น",
    description: "<p>ที่พักในหุบเขา</p>",
    location: "เชียงใหม่",
    amenities: ["ไวไฟ", "ที่จอดรถ"],
    prohibitions: ["ห้ามสูบบุหรี่"],
    check_in_info: "เช็คอิน 14:00",
    policies: "<p>นโยบาย</p>",
    faq: [{ question: "มีที่จอดรถไหม", answer: "มี" }],
  }),
  rooms: [makeRoom({ id: "room-1", name: "บ้านสน", description: "วิวภูเขา" })],
  roomOptions: [{ id: "opt-1", name: "อาหารเช้า" }] as RoomOption[],
  reviews: [{ id: "rev-1", comment: "ดีมาก", stay_highlight: "วิวสวย", topic: "ธรรมชาติ" }] as Review[],
  seasonalPrices: [{ id: "season-1", name: "ช่วงสงกรานต์" }] as RoomSeasonalPrice[],
  specialPrices: [{ id: "special-1", name: "ราคาเสาร์-อาทิตย์" }] as RoomSpecialPrice[],
  guestPricing: [{ id: "tier-1", detail: "อายุ 0-5 ปี" }] as RoomGuestPricing[],
  host: makeHost({ bank_name: "ธนาคารกสิกรไทย" }),
});

const translated = (over: Partial<TranslationPayload> = {}): TranslationPayload => ({
  homestay: {
    name: "Doi Inthanon Retreat",
    tagline: "Quiet and shaded",
    description: "<p>A place in the valley</p>",
    location: "Chiang Mai",
    amenities: ["WiFi", "Parking"],
    prohibitions: ["No smoking"],
    check_in_info: "Check in 14:00",
    policies: "<p>Policies</p>",
    faq: [{ question: "Is there parking?", answer: "Yes" }],
  },
  rooms: [{ id: "room-1", name: "Pine House", description: "Mountain view" }],
  roomOptions: [{ id: "opt-1", name: "Breakfast" }],
  reviews: [{ id: "rev-1", comment: "Great", stay_highlight: "Lovely view", topic: "Nature" }],
  seasonalPrices: [{ id: "season-1", name: "Songkran" }],
  specialPrices: [{ id: "special-1", name: "Weekend rate" }],
  roomGuestPricing: [{ id: "tier-1", detail: "Ages 0-5" }],
  host: { bank_name: "Kasikorn Bank" },
  ...over,
});

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  getReadyRedis.mockResolvedValue(null);
  getRedis.mockReturnValue(null);
  generateObject.mockResolvedValue({ object: translated() });
});

describe("localizeHomestay", () => {
  it("returns Thai content untouched without calling anything", async () => {
    const source = input();
    await expect(localizeHomestay(source, "th")).resolves.toBe(source);
    expect(getReadyRedis).not.toHaveBeenCalled();
    expect(generateObject).not.toHaveBeenCalled();
  });

  it("replaces every translatable field on the homestay", async () => {
    const result = await localizeHomestay(input(), "en");

    expect(result.homestay).toMatchObject({
      name: "Doi Inthanon Retreat",
      tagline: "Quiet and shaded",
      description: "<p>A place in the valley</p>",
      location: "Chiang Mai",
      amenities: ["WiFi", "Parking"],
      prohibitions: ["No smoking"],
      check_in_info: "Check in 14:00",
      policies: "<p>Policies</p>",
      faq: [{ question: "Is there parking?", answer: "Yes" }],
    });
  });

  it("keeps every untranslated homestay field intact", async () => {
    const source = input();
    const result = await localizeHomestay(source, "en");

    expect(result.homestay.id).toBe(source.homestay.id);
    expect(result.homestay.slug).toBe(source.homestay.slug);
    expect(result.homestay.theme_color).toBe(source.homestay.theme_color);
  });

  it("matches each related row by id", async () => {
    const result = await localizeHomestay(input(), "en");

    expect(result.rooms[0]).toMatchObject({ id: "room-1", name: "Pine House", description: "Mountain view" });
    expect(result.roomOptions[0]).toMatchObject({ id: "opt-1", name: "Breakfast" });
    expect(result.reviews[0]).toMatchObject({ comment: "Great", stay_highlight: "Lovely view", topic: "Nature" });
    expect(result.seasonalPrices[0]).toMatchObject({ name: "Songkran" });
    expect(result.specialPrices[0]).toMatchObject({ name: "Weekend rate" });
    expect(result.guestPricing[0]).toMatchObject({ detail: "Ages 0-5" });
    expect(result.host.bank_name).toBe("Kasikorn Bank");
  });

  it("keeps a row untouched when the translation has no entry for its id", async () => {
    generateObject.mockResolvedValue({
      object: translated({
        rooms: [],
        roomOptions: [],
        reviews: [],
        seasonalPrices: [],
        specialPrices: [],
        roomGuestPricing: [],
      }),
    });

    const result = await localizeHomestay(input(), "en");

    expect(result.rooms[0].name).toBe("บ้านสน");
    expect(result.roomOptions[0].name).toBe("อาหารเช้า");
    expect(result.reviews[0].comment).toBe("ดีมาก");
    expect(result.seasonalPrices[0].name).toBe("ช่วงสงกรานต์");
    expect(result.specialPrices[0].name).toBe("ราคาเสาร์-อาทิตย์");
    expect(result.guestPricing[0].detail).toBe("อายุ 0-5 ปี");
  });

  it("treats null amenity, prohibition and FAQ columns as empty lists", async () => {
    const source = input();
    source.homestay.amenities = null as unknown as string[];
    source.homestay.prohibitions = null as unknown as string[];
    source.homestay.faq = null as unknown as { question: string; answer: string }[];

    await localizeHomestay(source, "en");

    const payload = JSON.parse(
      (generateObject.mock.calls[0][0] as { prompt: string }).prompt.split("\n\n")[1],
    );
    expect(payload.homestay.amenities).toEqual([]);
    expect(payload.homestay.prohibitions).toEqual([]);
    expect(payload.homestay.faq).toEqual([]);
  });

  it("falls back to the Thai content when Gemini fails", async () => {
    generateObject.mockRejectedValue(new Error("quota exceeded"));
    const source = input();

    await expect(localizeHomestay(source, "en")).resolves.toBe(source);
    expect(console.error).toHaveBeenCalled();
  });

  it("tolerates a homestay with no rooms, reviews or extras", async () => {
    const bare = { ...input(), rooms: [], roomOptions: [], reviews: [], seasonalPrices: [], specialPrices: [], guestPricing: [] };
    generateObject.mockResolvedValue({
      object: translated({ rooms: [], roomOptions: [], reviews: [], seasonalPrices: [], specialPrices: [], roomGuestPricing: [] }),
    });

    const result = await localizeHomestay(bare, "en");
    expect(result.rooms).toEqual([]);
    expect(result.homestay.name).toBe("Doi Inthanon Retreat");
  });

  describe("caching", () => {
    it("serves a cached translation without calling Gemini", async () => {
      getReadyRedis.mockResolvedValue(redisClient(JSON.stringify(translated())));

      const result = await localizeHomestay(input(), "en");

      expect(result.homestay.name).toBe("Doi Inthanon Retreat");
      expect(generateObject).not.toHaveBeenCalled();
    });

    it("accepts a cache entry written before specialPrices existed", async () => {
      const legacy = translated() as Partial<TranslationPayload>;
      delete legacy.specialPrices;
      getReadyRedis.mockResolvedValue(redisClient(JSON.stringify(legacy)));

      const result = await localizeHomestay(input(), "en");

      expect(generateObject).not.toHaveBeenCalled();
      // Nothing to match against, so the Thai name survives.
      expect(result.specialPrices[0].name).toBe("ราคาเสาร์-อาทิตย์");
    });

    it("keys the cache by environment, locale and homestay", async () => {
      const client = redisClient();
      getReadyRedis.mockResolvedValue(client);

      await localizeHomestay(input(), "en");

      expect(client.get).toHaveBeenCalledWith(
        expect.stringMatching(/^test:homestay:i18n:en:homestay-1:[0-9a-f]{16}$/),
      );
    });

    it("changes the cache key when the content changes", async () => {
      const client = redisClient();
      getReadyRedis.mockResolvedValue(client);

      await localizeHomestay(input(), "en");
      const edited = input();
      edited.homestay.description = "<p>แก้ไขแล้ว</p>";
      await localizeHomestay(edited, "en");

      const [first, second] = client.get.mock.calls.map((c) => c[0]);
      expect(first).not.toBe(second);
    });

    it("translates afresh when the cached payload has the wrong shape", async () => {
      getReadyRedis.mockResolvedValue(redisClient(JSON.stringify({ homestay: { name: 42 } })));
      await localizeHomestay(input(), "en");
      expect(generateObject).toHaveBeenCalled();
    });

    it("translates afresh when the cached value is not JSON", async () => {
      getReadyRedis.mockResolvedValue(redisClient("<html>error</html>"));
      await localizeHomestay(input(), "en");
      expect(generateObject).toHaveBeenCalled();
      expect(console.error).toHaveBeenCalled();
    });

    it("writes the translation and evicts entries for older content", async () => {
      const client = redisClient(null, [["test:homestay:i18n:en:homestay-1:oldhash"]]);
      getRedis.mockReturnValue(client);

      await localizeHomestay(input(), "en");

      expect(client.del).toHaveBeenCalledWith("test:homestay:i18n:en:homestay-1:oldhash");
      expect(client.set).toHaveBeenCalledWith(
        expect.stringContaining("test:homestay:i18n:en:homestay-1:"),
        expect.any(String),
        "EX",
        60 * 60 * 24 * 365,
      );
    });

    it("does not delete anything when there is nothing stale", async () => {
      const client = redisClient(null, [[]]);
      getRedis.mockReturnValue(client);

      await localizeHomestay(input(), "en");
      expect(client.del).not.toHaveBeenCalled();
    });

    it("still translates when Redis is unavailable or failing", async () => {
      const client = redisClient();
      client.get.mockRejectedValue(new Error("connection reset"));
      client.set.mockRejectedValue(new Error("read only replica"));
      getReadyRedis.mockResolvedValue(client);
      getRedis.mockReturnValue(client);

      const result = await localizeHomestay(input(), "en");
      expect(result.homestay.name).toBe("Doi Inthanon Retreat");
      expect(console.error).toHaveBeenCalled();
    });
  });
});
