import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { HeroSection } from "@/components/booking/hero-section";

const hero = (tagline: string | null = "ทะเลหมอก") =>
  renderToStaticMarkup(createElement(HeroSection, { name: "บ้านริมธาร", tagline, heroImageUrl: null }));

const text = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();

describe("HeroSection", () => {
  it("says only the homestay's name and tagline", () => {
    expect(text(hero())).toBe("บ้านริมธาร ทะเลหมอก");
    expect(text(hero(null))).toBe("บ้านริมธาร");
  });

  it("centres them", () => {
    expect(hero()).toMatch(/class="[^"]*\bjustify-center\b[^"]*"/);
    expect(hero()).toMatch(/class="[^"]*\btext-center\b[^"]*"/);
  });

  it("renders visible and still: no entrance, parallax or scroll fade", () => {
    expect(hero()).not.toMatch(/style="[^"]*(opacity|transform|filter)/);
  });

  it("sets the tagline under the name, without uppercase or letter-spacing (Thai has no capitals)", () => {
    const html = hero();
    expect(html.indexOf("ทะเลหมอก")).toBeGreaterThan(html.indexOf("บ้านริมธาร"));
    expect(html).not.toMatch(/\b(uppercase|tracking-[a-z]+)\b/);
  });
});
