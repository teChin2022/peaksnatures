import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { HeroSection } from "@/components/booking/hero-section";

// Keys stand in for the copy: this tests which promise is made, not its wording.
vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
  useLocale: () => "th",
}));

const hero = (quickOnly?: boolean) =>
  renderToStaticMarkup(createElement(HeroSection, { name: "บ้านริมธาร", tagline: null, heroImageUrl: null, quickOnly }));

const withTagline = () =>
  renderToStaticMarkup(
    createElement(HeroSection, { name: "บ้านริมธาร", tagline: "ทะเลหมอก", heroImageUrl: null, averageRating: 4.5, reviewCount: 3, isVerified: true }),
  );

describe("HeroSection", () => {
  it("renders visible and still: no entrance, parallax or scroll fade", () => {
    expect(withTagline()).not.toMatch(/style="[^"]*(opacity|transform|filter)/);
  });

  it("puts the tagline under the name, without uppercase or letter-spacing (Thai has no capitals)", () => {
    const html = withTagline();
    expect(html.indexOf("ทะเลหมอก")).toBeGreaterThan(html.indexOf("บ้านริมธาร"));
    expect(html).not.toMatch(/\b(uppercase|tracking-[a-z]+)\b/);
  });

  it("separates rating and verified with a dot hidden on phones, so a wrapped line never ends on it", () => {
    expect(withTagline()).toMatch(/<span aria-hidden="true" class="hidden sm:inline[^"]*">·<\/span>/);
  });

  it("promises instant confirmation on the normal flow", () => {
    expect(hero()).toContain("instantConfirm");
    expect(hero()).not.toContain("hostConfirms");
  });

  it("promises confirmation by the host when the host takes quick bookings only", () => {
    expect(hero(true)).toContain("hostConfirms");
    expect(hero(true)).not.toContain("instantConfirm");
  });
});
