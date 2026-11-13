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

const hero = async ({
  bookingDisabled,
  cancellationDays,
  quickOnly,
  name = "บ้านริมธาร",
}: { bookingDisabled?: boolean; cancellationDays?: number; quickOnly?: boolean; name?: string } = {}) =>
  renderToStaticMarkup(
    await LandingHero({
      name,
      tagline: "ตื่นมากับทะเลหมอก",
      heroImageUrl: null,
      location: "เชียงใหม่",
      isVerified: true,
      averageRating: 4.5,
      reviewCount: 3,
      fromPrice: 1500,
      discoverHref: "#gallery",
      bookingDisabled,
      cancellationDays,
      quickOnly,
    }),
  );

describe("LandingHero", () => {
  it("says up front when the host can't take bookings", async () => {
    expect(await hero()).not.toContain("unavailableTitle");
    expect(await hero({ bookingDisabled: true })).toContain("unavailableTitle");
  });

  it("promises instant confirmation, and free cancellation only when the host set days", async () => {
    expect(await hero()).toContain("instantConfirm");
    expect(await hero()).not.toContain("cancellationPolicyNote");
    expect(await hero({ cancellationDays: 0 })).not.toContain("cancellationPolicyNote");
    expect(await hero({ cancellationDays: 7 })).toContain("cancellationPolicyNote");
  });

  it("promises confirmation by the host, not instant confirmation, when the host takes quick bookings only", async () => {
    const html = await hero({ quickOnly: true });
    expect(html).toContain("hostConfirms");
    expect(html).not.toContain("instantConfirm");
  });

  it("makes no booking promise while the host can't take bookings", async () => {
    const html = await hero({ bookingDisabled: true, cancellationDays: 7 });
    expect(html).not.toContain("instantConfirm");
    expect(html).not.toContain("cancellationPolicyNote");
  });

  it("keeps each word of the name whole, so a Thai name wraps at its spaces", async () => {
    const html = await hero({ name: "อิงค์เขาแคมป์ปิ้ง ม่อนเงาะ" });
    expect(html).toContain('<span class="inline-block max-w-full">อิงค์เขาแคมป์ปิ้ง</span> <span class="inline-block max-w-full">ม่อนเงาะ</span>');
  });

  it("keeps one icon, the rating star: the other facts read as words", async () => {
    const html = await hero({ cancellationDays: 7 });
    expect(html).toContain("lucide-star");
    expect(html).not.toMatch(/lucide-(map-pin|shield-check|badge-check|calendar-x)/);
  });

  it("separates facts on one line with a dot hidden on phones, so a wrapped line never ends on it", async () => {
    expect(await hero()).toMatch(/<span aria-hidden="true" class="hidden sm:inline[^"]*">·<\/span>/);
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
