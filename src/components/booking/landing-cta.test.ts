import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { LandingBookBar, LandingCta } from "@/components/booking/landing-cta";

const intl = vi.hoisted(() => ({ locale: "th" }));
vi.mock("next-intl/server", () => ({
  getTranslations: async () => (key: string) => key,
  getLocale: async () => intl.locale,
}));
vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children?: ReactNode }) => createElement("a", { href, ...rest }, children),
}));

beforeEach(() => {
  intl.locale = "th";
});

const bar = async (props: { price?: { price: number; from: boolean } | null; bookingDisabled?: boolean } = {}) =>
  renderToStaticMarkup(await LandingBookBar({ bookHref: "/baan/book", price: { price: 1500, from: true }, ...props }));
const band = async (bookingDisabled?: boolean, imageUrl: string | null = null) =>
  renderToStaticMarkup(await LandingCta({ bookHref: "/baan/book", bookingDisabled, imageUrl }));

describe("LandingBookBar", () => {
  it("links to the booking page with tonight's price", async () => {
    const html = await bar();
    expect(html).toContain('href="/baan/book"');
    expect(html).toContain("฿1,500");
  });

  it("labels the price as a minimum when the houses are priced apart", async () => {
    const html = await bar();
    expect(html).toContain("card.from");
    expect(html).not.toContain("card.price");
  });

  it("labels it 'price' when every house costs the same", async () => {
    const html = await bar({ price: { price: 1500, from: false } });
    expect(html).toContain("card.price");
    expect(html).not.toContain("card.from");
  });

  it("is a dimmed label, not a link, while the host can't take bookings", async () => {
    const html = await bar({ bookingDisabled: true });
    expect(html).not.toContain("href=");
    expect(html).toContain("opacity-40");
    expect(html).toContain("unavailableTitle");
  });

  it("never spaces or capitalises the label: the button reads as the header's does", async () => {
    expect(await bar()).not.toContain("tracking-widest");
    intl.locale = "en";
    expect(await bar()).not.toContain("uppercase");
  });

  it("gives the button the whole bar when there is no price", async () => {
    const html = await bar({ price: null });
    expect(html).not.toContain("฿");
    expect(html).toMatch(/<a [^>]*class="[^"]*\bw-full\b/);
  });
});

describe("LandingCta", () => {
  it("offers the booking page", async () => {
    const html = await band();
    expect(html).toContain('href="/baan/book"');
    expect(html).toContain("title");
  });

  it("names the action as the header and sticky bar do, and says how booking works", async () => {
    const html = await band();
    expect(html).toContain("bookHouse");
    expect(html).toContain("intro");
  });

  it("shows the booking page's notice in place of the button while bookings are off", async () => {
    const html = await band(true);
    expect(html).not.toContain("href=");
    expect(html).toContain("unavailableTitle");
    expect(html).toContain("unavailableDesc");
  });

  it("sits over the homestay's own photo when it has one, and on solid Pine without", async () => {
    expect(await band(false, "/hero.jpg")).toContain("hero.jpg");
    expect(await band()).not.toContain("<img");
  });
});
