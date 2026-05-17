import { createHash } from "crypto";
import { generateObject } from "ai";
import { google } from "@ai-sdk/google";
import { z } from "zod";
import { getRedis, getCacheEnvPrefix } from "@/lib/redis";
import type { SupportedLocale } from "./types";

const CACHE_TTL_SECONDS = 60 * 60 * 24 * 7;

type StringMap = Record<string, string | null>;

export async function localizeStrings<T extends StringMap>(
  namespace: string,
  strings: T,
  locale: SupportedLocale,
): Promise<T> {
  if (locale === "th") return strings;

  const keys = Object.keys(strings).sort();
  const hasContent = keys.some((k) => typeof strings[k] === "string" && (strings[k] as string).trim().length > 0);
  if (!hasContent) return strings;

  const contentHash = createHash("sha1")
    .update(JSON.stringify(keys.map((k) => [k, strings[k]])))
    .digest("hex")
    .slice(0, 16);
  const cacheKey = `${getCacheEnvPrefix()}:strings:i18n:${locale}:${namespace}:${contentHash}`;

  const cached = await readCache(cacheKey, keys);
  if (cached) return merge(strings, cached);

  const translated = await translateStrings(strings, locale);
  if (!translated) return strings;

  await writeCache(cacheKey, translated);
  return merge(strings, translated);
}

async function readCache(key: string, keys: string[]): Promise<StringMap | null> {
  const redis = getRedis();
  if (!redis) return null;
  try {
    const raw = await redis.get(key);
    if (!raw) return null;
    const shape = z.record(z.enum(keys as [string, ...string[]]), z.string().nullable());
    const parsed = shape.safeParse(JSON.parse(raw));
    return parsed.success ? (parsed.data as StringMap) : null;
  } catch (err) {
    console.error("[localize-strings] redis read failed:", (err as Error).message);
    return null;
  }
}

async function writeCache(key: string, value: StringMap): Promise<void> {
  const redis = getRedis();
  if (!redis) return;
  try {
    await redis.set(key, JSON.stringify(value), "EX", CACHE_TTL_SECONDS);
  } catch (err) {
    console.error("[localize-strings] redis write failed:", (err as Error).message);
  }
}

async function translateStrings(strings: StringMap, locale: SupportedLocale): Promise<StringMap | null> {
  const keys = Object.keys(strings);
  const targetLanguage = locale === "en" ? "English" : "Thai";
  const schema = z.object(Object.fromEntries(keys.map((k) => [k, z.string().nullable()])));

  const system = `You translate short user-facing labels from Thai to ${targetLanguage} for a booking platform. Translate every value. Preserve null values as null. For bank names, output the standard English form (e.g. "ธนาคารกสิกรไทย" → "Kasikorn Bank"). Return JSON matching the provided schema exactly.`;

  const prompt = `Translate these labels:\n${JSON.stringify(strings, null, 2)}`;

  try {
    const result = await generateObject({
      model: google("gemini-2.5-flash"),
      system,
      prompt,
      schema,
    });
    return result.object as StringMap;
  } catch (err) {
    console.error("[localize-strings] gemini call failed:", (err as Error).message);
    return null;
  }
}

function merge<T extends StringMap>(input: T, translated: StringMap): T {
  const out: StringMap = { ...input };
  for (const k of Object.keys(input)) {
    if (k in translated) out[k] = translated[k];
  }
  return out as T;
}
