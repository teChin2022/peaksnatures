import { createElement, type ComponentProps } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { HomestayCard } from "@/components/landing/homestay-card";
import { withIntl } from "../../../test/helpers/intl";

const card = (props: Partial<ComponentProps<typeof HomestayCard>> = {}) =>
  renderToStaticMarkup(
    withIntl(createElement(HomestayCard, {
      slug: "ing-khoa",
      name: "อิงเขา แคมปิ้ง",
      location: "จ.เชียงใหม่",
      heroImageUrl: "https://example.test/a.jpg",
      gallery: [],
      minPrice: 1200,
      maxGuests: 4,
      tagline: null,
      reviewCount: 0,
      averageRating: 0,
      isHostVerified: false,
      ...props,
    })),
  );

describe("HomestayCard", () => {
  it("labels the lowest house price as a starting price", () => {
    const html = card();
    expect(html).toContain("เริ่มต้น");
    expect(html).toContain("1,200");
    // DESIGN.md Price role: serif with lining, tabular figures (old-style ones read ฿100 as ฿1OO).
    expect(html).toMatch(/font-serif[^"]*"[^>]*font-feature-settings:&quot;lnum&quot;, &quot;tnum&quot;/);
  });

  it("sets the homestay name in the serif Title role", () => {
    expect(card()).toMatch(/<h3 class="[^"]*font-serif[^"]*text-2xl[^"]*">อิงเขา แคมปิ้ง<\/h3>/);
  });

  it("reads the rating out in words, not as a bare number", () => {
    const html = card({ reviewCount: 8, averageRating: 3.9 });
    expect(html).toContain('<span class="sr-only">คะแนน 3.9 จาก 8 รีวิว</span>');
  });

  // DESIGN.md Flat-at-Rest, and movement only when the visitor allows it.
  it("is flat at rest and only moves under motion-safe", () => {
    const html = card();
    expect(html).not.toMatch(/shadow-(sm|md|lg)/);
    // A class token that starts with hover:/group-hover: (no motion-safe: in front) and moves things.
    expect(html).not.toMatch(/(?<![\w:-])(hover|group-hover):(-?translate|scale)/);
    expect(html).not.toContain("duration-700");
  });

  it("says booking is closed when no house has a price", () => {
    const html = card({ minPrice: null });
    expect(html).not.toContain("฿");
    expect(html).toContain("ไม่พร้อมรับจองชั่วคราว");
  });

  it("shows the verified badge only for verified hosts", () => {
    expect(card({ isHostVerified: true })).toContain("โฮสต์ยืนยันตัวตนแล้ว");
    expect(card({ isHostVerified: false })).not.toContain("ยืนยันตัวตน");
  });

  it("falls back to Thai copy without a photo", () => {
    const html = card({ heroImageUrl: null });
    expect(html).toContain("ยังไม่มีรูปภาพ");
    expect(html).not.toContain("No image");
  });

  it("does not repeat the name in the photo's alt (the link already reads it)", () => {
    expect(card()).toContain('alt=""');
  });
});
