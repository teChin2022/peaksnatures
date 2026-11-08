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

const bar = async (props: { fromPrice?: number | null; bookingDisabled?: boolean } = {}) =>
  renderToStaticMarkup(await LandingBookBar({ bookHref: "/baan/book", fromPrice: 1500, ...props }));
const band = async (bookingDisabled?: boolean) =>
  renderToStaticMarkup(await LandingCta({ bookHref: "/baan/book", bookingDisabled }));

describe("LandingBookBar", () => {
  it("links to the booking page with the from-price", async () => {
    const html = await bar();
    expect(html).toContain('href="/baan/book"');
    expect(html).toContain("฿1,500");
  });

  it("is a dimmed label, not a link, while the host can't take bookings", async () => {
    const html = await bar({ bookingDisabled: true });
    expect(html).not.toContain("href=");
    expect(html).toContain("opacity-40");
    expect(html).toContain("unavailableTitle");
  });

  it("spaces the label's capitals in English only, never in Thai", async () => {
    expect(await bar()).not.toContain("tracking-widest");
    intl.locale = "en";
    expect(await bar()).toContain("uppercase tracking-widest");
  });
});

describe("LandingCta", () => {
  it("offers the booking page", async () => {
    const html = await band();
    expect(html).toContain('href="/baan/book"');
    expect(html).toContain("title");
  });

  it("shows the booking page's notice in place of the button while bookings are off", async () => {
    const html = await band(true);
    expect(html).not.toContain("href=");
    expect(html).toContain("unavailableTitle");
    expect(html).toContain("unavailableDesc");
  });
});
