import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { LandingHero } from "@/components/booking/landing-hero";

const intl = vi.hoisted(() => ({ locale: "th" }));
vi.mock("next-intl/server", () => ({
  getTranslations: async () => (key: string) => key,
  getLocale: async () => intl.locale,
}));

beforeEach(() => {
  intl.locale = "th";
});

const hero = async (bookingDisabled?: boolean) =>
  renderToStaticMarkup(
    await LandingHero({
      name: "บ้านริมธาร",
      tagline: "ตื่นมากับทะเลหมอก",
      heroImageUrl: null,
      location: "เชียงใหม่",
      isVerified: true,
      averageRating: 4.5,
      reviewCount: 3,
      fromPrice: 1500,
      discoverHref: "#gallery",
      bookingDisabled,
    }),
  );

describe("LandingHero", () => {
  it("says up front when the host can't take bookings", async () => {
    expect(await hero()).not.toContain("unavailableTitle");
    expect(await hero(true)).toContain("unavailableTitle");
  });

  it("scrolls on to the section it is given", async () => {
    expect(await hero()).toContain('href="#gallery"');
  });

  it("sets the tagline in italic for English only: Thai has no italic face", async () => {
    expect(await hero()).not.toMatch(/class="[^"]*\bitalic\b/);
    intl.locale = "en";
    expect(await hero()).toMatch(/class="[^"]*\bitalic\b/);
  });
});
