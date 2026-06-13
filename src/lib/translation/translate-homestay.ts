import { createHash } from "crypto";
import { generateObject } from "ai";
import { google } from "@ai-sdk/google";
import { getRedis, getReadyRedis, getCacheEnvPrefix } from "@/lib/redis";
import type { Homestay, Room, RoomOption, Review, RoomSeasonalPrice, RoomGuestPricing, Host } from "@/types/database";
import {
  translationPayloadSchema,
  type SupportedLocale,
  type TranslationPayload,
} from "./types";

const CACHE_TTL_SECONDS = 60 * 60 * 24 * 365;

interface LocalizeInput {
  homestay: Homestay;
  rooms: Room[];
  roomOptions: RoomOption[];
  reviews: Review[];
  seasonalPrices: RoomSeasonalPrice[];
  guestPricing: RoomGuestPricing[];
  host: Host;
}

export async function localizeHomestay<T extends LocalizeInput>(
  input: T,
  locale: SupportedLocale,
): Promise<T> {
  if (locale === "th") return input;

  const sourcePayload = extractSourcePayload(input);
  const contentHash = hashSource(sourcePayload);
  const keyPrefix = `${getCacheEnvPrefix()}:homestay:i18n:${locale}:${input.homestay.id}`;
  const cacheKey = `${keyPrefix}:${contentHash}`;

  const cached = await readCache(cacheKey);
  if (cached) {
    return mergeTranslation(input, cached);
  }

  const translated = await translateWithGemini(sourcePayload, locale);
  if (!translated) return input;

  await writeCache(keyPrefix, cacheKey, translated);
  return mergeTranslation(input, translated);
}

function extractSourcePayload(input: LocalizeInput): TranslationPayload {
  return {
    homestay: {
      name: input.homestay.name,
      tagline: input.homestay.tagline,
      description: input.homestay.description,
      location: input.homestay.location,
      amenities: input.homestay.amenities ?? [],
      prohibitions: input.homestay.prohibitions ?? [],
      check_in_info: input.homestay.check_in_info,
      policies: input.homestay.policies,
      faq: input.homestay.faq ?? [],
    },
    rooms: input.rooms.map((r) => ({
      id: r.id,
      name: r.name,
      description: r.description,
    })),
    roomOptions: input.roomOptions.map((o) => ({
      id: o.id,
      name: o.name,
    })),
    reviews: input.reviews.map((r) => ({
      id: r.id,
      comment: r.comment,
      stay_highlight: r.stay_highlight,
      topic: r.topic,
    })),
    seasonalPrices: input.seasonalPrices.map((p) => ({
      id: p.id,
      name: p.name,
    })),
    roomGuestPricing: input.guestPricing.map((t) => ({
      id: t.id,
      detail: t.detail,
    })),
    host: {
      bank_name: input.host.bank_name,
    },
  };
}

function hashSource(payload: TranslationPayload): string {
  return createHash("sha1").update(JSON.stringify(payload)).digest("hex").slice(0, 16);
}

async function readCache(key: string): Promise<TranslationPayload | null> {
  const redis = await getReadyRedis();
  if (!redis) return null;
  try {
    const raw = await redis.get(key);
    if (!raw) return null;
    const parsed = translationPayloadSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : null;
  } catch (err) {
    console.error("[translation] redis read failed:", (err as Error).message);
    return null;
  }
}

async function writeCache(
  keyPrefix: string,
  cacheKey: string,
  value: TranslationPayload,
): Promise<void> {
  const redis = getRedis();
  if (!redis) return;
  try {
    const stream = redis.scanStream({ match: `${keyPrefix}:*`, count: 100 });
    const stale: string[] = [];
    for await (const keys of stream as AsyncIterable<string[]>) {
      for (const k of keys) if (k !== cacheKey) stale.push(k);
    }
    if (stale.length) await redis.del(...stale);
    await redis.set(cacheKey, JSON.stringify(value), "EX", CACHE_TTL_SECONDS);
  } catch (err) {
    console.error("[translation] redis write failed:", (err as Error).message);
  }
}

async function translateWithGemini(
  source: TranslationPayload,
  locale: SupportedLocale,
): Promise<TranslationPayload | null> {
  const targetLanguage = locale === "en" ? "English" : "Thai";

  const system = `You translate booking-page content for a Thai nature-homestay platform from Thai to ${targetLanguage}.

Rules:
- Translate every string. Do not leave Thai text in the output.
- Preserve all HTML tags, attributes, and structure exactly in description, check_in_info, and policies. Only translate the visible text inside tags.
- Preserve array lengths and item order for amenities, prohibitions, faq, rooms, roomOptions, reviews, seasonalPrices, roomGuestPricing.
- Preserve every "id" field exactly as given for rooms, roomOptions, reviews, seasonalPrices, and roomGuestPricing.
- For roomGuestPricing.detail, translate the short note (e.g. an age range or extra-guest remark). If a detail is null, return null unchanged.
- For host.bank_name, render the standard English bank name (e.g. "ธนาคารกสิกรไทย" → "Kasikorn Bank", "ธนาคารไทยพาณิชย์" → "SCB", "ธนาคารกรุงเทพ" → "Bangkok Bank"). If null in source, return null unchanged.
- For seasonalPrices.name, keep them short (e.g. "Songkran", "Christmas", "High season", "Weekend rate").
- For amenity and prohibition labels, output short conventional booking-platform vocabulary (e.g., "WiFi", "Parking", "Kitchen", "No smoking", "No pets"). Strip any parenthesized English already present in the source.
- For homestay name and place names, render naturally in ${targetLanguage}; transliterate if there is no common translation.
- Review comments and stay_highlight: preserve the guest's voice — keep them casual and conversational, do not formalize. If a field is null, return null unchanged.
- Keep tone warm, concise, and natural — match the original's voice.
- Return strictly the JSON object matching the provided schema.`;

  const prompt = `Translate this homestay content payload from Thai to ${targetLanguage}:

${JSON.stringify(source, null, 2)}`;

  try {
    const result = await generateObject({
      model: google("gemini-2.5-flash"),
      system,
      prompt,
      schema: translationPayloadSchema,
    });
    return result.object;
  } catch (err) {
    console.error("[translation] gemini call failed:", (err as Error).message);
    return null;
  }
}

function mergeTranslation<T extends LocalizeInput>(
  input: T,
  translated: TranslationPayload,
): T {
  const roomById = new Map(translated.rooms.map((r) => [r.id, r]));
  const optionById = new Map(translated.roomOptions.map((o) => [o.id, o]));
  const reviewById = new Map(translated.reviews.map((r) => [r.id, r]));
  const priceById = new Map(translated.seasonalPrices.map((p) => [p.id, p]));
  const tierById = new Map(translated.roomGuestPricing.map((t) => [t.id, t]));

  return {
    ...input,
    homestay: {
      ...input.homestay,
      name: translated.homestay.name,
      tagline: translated.homestay.tagline,
      description: translated.homestay.description,
      location: translated.homestay.location,
      amenities: translated.homestay.amenities,
      prohibitions: translated.homestay.prohibitions,
      check_in_info: translated.homestay.check_in_info,
      policies: translated.homestay.policies,
      faq: translated.homestay.faq,
    },
    rooms: input.rooms.map((r) => {
      const t = roomById.get(r.id);
      if (!t) return r;
      return { ...r, name: t.name, description: t.description };
    }),
    roomOptions: input.roomOptions.map((o) => {
      const t = optionById.get(o.id);
      if (!t) return o;
      return { ...o, name: t.name };
    }),
    reviews: input.reviews.map((r) => {
      const t = reviewById.get(r.id);
      if (!t) return r;
      return { ...r, comment: t.comment, stay_highlight: t.stay_highlight, topic: t.topic };
    }),
    seasonalPrices: input.seasonalPrices.map((p) => {
      const t = priceById.get(p.id);
      if (!t) return p;
      return { ...p, name: t.name };
    }),
    guestPricing: input.guestPricing.map((g) => {
      const t = tierById.get(g.id);
      if (!t) return g;
      return { ...g, detail: t.detail };
    }),
    host: {
      ...input.host,
      bank_name: translated.host.bank_name,
    },
  };
}
