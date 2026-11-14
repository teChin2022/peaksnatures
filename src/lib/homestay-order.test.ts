import { describe, expect, it } from "vitest";
import { compareHomestays } from "./homestay-order";

const h = (slug: string, average_rating: number, created_at: string, min_price: number | null = 1000) => ({
  slug,
  average_rating,
  created_at,
  min_price,
});

const order = (list: ReturnType<typeof h>[]) => [...list].sort(compareHomestays).map((x) => x.slug);

describe("compareHomestays", () => {
  it("puts homestays with no open house last, whatever their rating (owner's pick, 2026-11-13)", () => {
    expect(
      order([
        h("closed-top-rated", 5, "2026-01-01", null),
        h("open-unrated", 0, "2026-03-01"),
        h("open-rated", 4.2, "2026-02-01"),
      ]),
    ).toEqual(["open-rated", "open-unrated", "closed-top-rated"]);
  });

  it("keeps the existing order inside each group: rated first, higher rating first, then oldest first", () => {
    expect(
      order([
        h("new-unrated", 0, "2026-05-01"),
        h("old-unrated", 0, "2026-01-01"),
        h("rated-4", 4, "2026-04-01"),
        h("rated-5", 5, "2026-06-01"),
      ]),
    ).toEqual(["rated-5", "rated-4", "old-unrated", "new-unrated"]);
    expect(
      order([h("closed-new", 0, "2026-05-01", null), h("closed-rated", 3, "2026-06-01", null), h("closed-old", 0, "2026-01-01", null)]),
    ).toEqual(["closed-rated", "closed-old", "closed-new"]);
  });
});
