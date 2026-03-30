export const RATING_CATEGORIES = [
  { key: "environment", dbColumn: "rating_environment" },
  { key: "cleanliness", dbColumn: "rating_cleanliness" },
  { key: "service", dbColumn: "rating_service" },
  { key: "value", dbColumn: "rating_value" },
] as const;

export type RatingCategoryKey = (typeof RATING_CATEGORIES)[number]["key"];

export const IMPRESSION_TAGS = [
  "scenic_view",
  "fresh_air",
  "peaceful",
  "delicious_food",
  "very_clean",
  "friendly",
  "close_to_nature",
  "good_value",
  "family_friendly",
  "romantic",
  "good_wifi",
] as const;

export type ImpressionTag = (typeof IMPRESSION_TAGS)[number];

export const WOULD_RETURN_OPTIONS = ["yes", "maybe", "no"] as const;

export type WouldReturn = (typeof WOULD_RETURN_OPTIONS)[number];

export const MAX_REVIEW_PHOTOS = 5;
export const REVIEWS_PER_PAGE = 12;
export const PREVIEW_REVIEW_COUNT = 3;
