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

describe("HeroSection", () => {
  it("promises instant confirmation on the normal flow", () => {
    expect(hero()).toContain("instantConfirm");
    expect(hero()).not.toContain("hostConfirms");
  });

  it("promises confirmation by the host when the host takes quick bookings only", () => {
    expect(hero(true)).toContain("hostConfirms");
    expect(hero(true)).not.toContain("instantConfirm");
  });
});
