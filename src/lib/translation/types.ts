import { z } from "zod";

export const translatedHomestaySchema = z.object({
  name: z.string(),
  tagline: z.string().nullable(),
  description: z.string(),
  location: z.string(),
  amenities: z.array(z.string()),
  prohibitions: z.array(z.string()),
  check_in_info: z.string().nullable(),
  policies: z.string().nullable(),
  faq: z.array(z.object({ question: z.string(), answer: z.string() })),
});

export const translatedRoomSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().nullable(),
});

export const translatedRoomOptionSchema = z.object({
  id: z.string(),
  name: z.string(),
});

export const translationPayloadSchema = z.object({
  homestay: translatedHomestaySchema,
  rooms: z.array(translatedRoomSchema),
  roomOptions: z.array(translatedRoomOptionSchema),
});

export type TranslatedHomestay = z.infer<typeof translatedHomestaySchema>;
export type TranslatedRoom = z.infer<typeof translatedRoomSchema>;
export type TranslatedRoomOption = z.infer<typeof translatedRoomOptionSchema>;
export type TranslationPayload = z.infer<typeof translationPayloadSchema>;

export type SupportedLocale = "th" | "en";
