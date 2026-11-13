import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { LandingContent } from "@/components/landing/landing-content";
import { withIntl } from "../../../test/helpers/intl";

const homestay = {
  slug: "ing-khoa",
  name: "อิงเขา แคมปิ้ง",
  location: "ม่อนเงาะ เชียงใหม่",
  hero_image_url: null,
  gallery: [],
  min_price: 1200,
  max_guests: 4,
  tagline: null,
  review_count: 0,
  average_rating: 0,
  is_host_verified: false,
};

// The server HTML is what a phone on slow 4G sees until hydration: nothing in
// it may wait for JavaScript to become visible (design-direction §7 "Visible at rest").
const serverHtml = (locale: "th" | "en" = "th") =>
  renderToString(withIntl(createElement(LandingContent, { homestays: [homestay], stats: [] }), locale));

describe("LandingContent server render", () => {
  it("renders the hero, search and homestay cards visible", () => {
    const html = serverHtml();
    expect(html).toContain("<h1");
    expect(html).toContain("คุณกำลังจะไปไหน?");
    expect(html).toContain("อิงเขา แคมปิ้ง");
    expect(html).not.toMatch(/opacity:\s*0(?![.\d])/);
    expect(html).not.toMatch(/filter:\s*blur/);
    expect(html).not.toMatch(/transform:\s*translateY\(100%\)/);
  });

  // Owner's pick 2026-11-13: guests first, so the homestays follow the hero.
  it("puts the homestays before the why and host sections", () => {
    const html = serverHtml();
    const at = (id: string) => html.indexOf(`id="${id}"`);
    expect(at("unique-homestays")).toBeGreaterThan(html.indexOf("<h1"));
    expect(at("unique-homestays")).toBeLessThan(at("why-peaksnature"));
    expect(at("why-peaksnature")).toBeLessThan(html.indexOf('href="/register"'));
  });

  // DESIGN.md: no tracked, uppercased or slanted Thai, and no earth-400/500 text on light surfaces.
  // Every string in these sections is Thai, so the classes alone are enough to check.
  it("keeps Thai upright and untracked, and text at earth-600 or darker", () => {
    const html = serverHtml();
    expect(html).not.toMatch(/\bitalic\b|\buppercase\b|tracking-\[|tracking-(tight|widest)/);
    expect(html).not.toMatch(/(?<![\w-])text-earth-[345]00/);
  });

  // Owner-approved copy (2026-11-13): only claims true for every host; no curation, luxury or deposit claims.
  it("pitches booking direct, without unverifiable claims", () => {
    const html = serverHtml();
    expect(html).toContain("โอนตรงเข้าบัญชีเจ้าของที่พัก");
    expect(html).toContain("รีวิวจากผู้เข้าพักจริง");
    expect(html).not.toMatch(/หรูหรา|คัดสรร|คัดเลือก|ยั่งยืน|ถูกสร้างขึ้น|มัดจำ|ไม่มีค่าลงประกาศ/);
  });

  it("renders English on the English locale", () => {
    const html = serverHtml("en");
    expect(html).toContain("Where are you going?");
    expect(html).toContain("Book directly with ");
    expect(html).toContain("From");
    // Only the homestay's own data (name, location) may stay Thai.
    const thai = html.replaceAll(homestay.name, "").replaceAll(homestay.location, "").match(/[ก-ฺเ-๛]+/g); // Thai letters, not the ฿ sign (U+0E3F)
    expect(thai).toBeNull();
  });

  it("labels the stats band in the visitor's language", () => {
    const stats = [
      { value: "36", label: "homestays" as const },
      { value: "4.8", label: "rating" as const, count: "11", star: true },
    ];
    const html = renderToString(withIntl(createElement(LandingContent, { homestays: [homestay], stats })));
    expect(html).toContain("โฮมสเตย์ที่เปิดให้จอง");
    expect(html).toContain("จาก 11 รีวิวผู้เข้าพักจริง");
  });

  // DESIGN.md Photo Scrim Rule: white text holds 4.5:1 over any photo. Flat black/55 over pure
  // white gives L≈0.171, so 4.75:1; the old gradient was ~black/20–30 behind the subtitle.
  it("puts the hero copy on a flat scrim that holds 4.5:1 over any photo", () => {
    const html = serverHtml();
    expect(html).toContain("bg-black/55");
    expect(html).not.toContain("bg-gradient");
  });

  // Owner's pick 2026-11-13: phones get a vertical list, not a sideways carousel, and each card renders once.
  it("lists homestays once, without a horizontal swipe row", () => {
    const html = serverHtml();
    expect(html.match(/href="\/ing-khoa"/g)).toHaveLength(1);
    expect(html).not.toContain("overflow-x-auto");
    expect(html).toContain("aspect-[4/3] sm:aspect-[4/5]");
  });

  // With fewer than 3 homestays a 3-column grid left a hole at lg; two fill the row with wider photos.
  it("fills the row when only two homestays are listed", () => {
    const two = [homestay, { ...homestay, slug: "doi-view", name: "ดอยวิว" }];
    const html = renderToString(withIntl(createElement(LandingContent, { homestays: two, stats: [] })));
    expect(html).not.toContain("lg:grid-cols-3");
    expect(html).toContain("lg:aspect-[4/3]");
    expect(serverHtml()).not.toContain("lg:aspect-[4/3]"); // one homestay keeps the normal card
  });

  // images.unoptimized is settled, so phones need their own file: an 800×1200 portrait crop
  // (111 KB) instead of the 2000px, 620 KB original. No preload, or phones fetch both.
  it("serves phones the small portrait hero and preloads neither", () => {
    const html = serverHtml();
    expect(html).toMatch(/<source media="\(max-width: 767px\)" srcSet="\/hero-mountain-portrait\.jpg"\/>/);
    expect(html).not.toContain('rel="preload"');
    // Vitest doesn't load next.config (no unoptimized), so match the file name, not the exact src.
    expect(html).toMatch(/<img[^>]*fetchPriority="high"[^>]*hero-mountain\.jpg/);
  });

  it("has no scroll progress bar", () => {
    expect(serverHtml()).not.toContain("z-[60]");
  });
});
