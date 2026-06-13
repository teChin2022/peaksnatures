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

export const translatedReviewSchema = z.object({
  id: z.string(),
  comment: z.string().nullable(),
  stay_highlight: z.string().nullable(),
  topic: z.string().nullable(),
});

export const translatedSeasonalPriceSchema = z.object({
  id: z.string(),
  name: z.string(),
});

export const translatedRoomGuestPricingSchema = z.object({
  id: z.string(),
  detail: z.string().nullable(),
});

export const translatedHostSchema = z.object({
  bank_name: z.string().nullable(),
});

export const translationPayloadSchema = z.object({
  homestay: translatedHomestaySchema,
  rooms: z.array(translatedRoomSchema),
  roomOptions: z.array(translatedRoomOptionSchema),
  reviews: z.array(translatedReviewSchema),
  seasonalPrices: z.array(translatedSeasonalPriceSchema),
  roomGuestPricing: z.array(translatedRoomGuestPricingSchema),
  host: translatedHostSchema,
});

export type TranslatedHomestay = z.infer<typeof translatedHomestaySchema>;
export type TranslatedRoom = z.infer<typeof translatedRoomSchema>;
export type TranslatedRoomOption = z.infer<typeof translatedRoomOptionSchema>;
export type TranslatedReview = z.infer<typeof translatedReviewSchema>;
export type TranslatedSeasonalPrice = z.infer<typeof translatedSeasonalPriceSchema>;
export type TranslatedRoomGuestPricing = z.infer<typeof translatedRoomGuestPricingSchema>;
export type TranslatedHost = z.infer<typeof translatedHostSchema>;
export type TranslationPayload = z.infer<typeof translationPayloadSchema>;

export type SupportedLocale = "th" | "en";
