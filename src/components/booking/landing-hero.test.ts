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

const hero = async ({ bookingDisabled, name = "บ้านริมธาร" }: { bookingDisabled?: boolean; name?: string } = {}) =>
  renderToStaticMarkup(
    await LandingHero({
      name,
      tagline: "ตื่นมากับทะเลหมอก",
      heroImageUrl: null,
      discoverHref: "#gallery",
      bookingDisabled,
    }),
  );

const text = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();

describe("LandingHero", () => {
  it("says only the homestay's name and tagline, then the cue to scroll", async () => {
    expect(text(await hero())).toBe("บ้านริมธาร ตื่นมากับทะเลหมอก discover");
  });

  it("says up front when the host can't take bookings", async () => {
    expect(await hero()).not.toContain("unavailableTitle");
    expect(await hero({ bookingDisabled: true })).toContain("unavailableTitle");
  });

  it("keeps each word of the name whole, so a Thai name wraps at its spaces", async () => {
    const html = await hero({ name: "อิงค์เขาแคมป์ปิ้ง ม่อนเงาะ" });
    expect(html).toContain('<span class="inline-block max-w-full">อิงค์เขาแคมป์ปิ้ง</span> <span class="inline-block max-w-full">ม่อนเงาะ</span>');
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
