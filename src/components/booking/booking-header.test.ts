// @vitest-environment happy-dom
import { act, createElement, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BookingHeader } from "@/components/booking/booking-header";

vi.mock("next-intl", () => ({ useTranslations: () => (key: string) => key, useLocale: () => "th" }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children?: ReactNode }) => createElement("a", { href, ...rest }, children),
}));
// The booking page's header pieces; the landing renders neither.
vi.mock("@/components/booking/header-cart", () => ({ HeaderCart: () => null }));
vi.mock("@/components/booking/resume-booking-dialog", () => ({ ResumeBookingDialog: () => null }));

// Tells React this is a test renderer, so act() flushes effects without warning.
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

const render = (props: { bookHref?: string; bookingDisabled?: boolean } = {}) =>
  act(() =>
    root.render(
      createElement(BookingHeader, { homestayName: "Baan", slug: "baan", homestayId: "homestay-1", ...props }),
    ),
  );

describe("BookingHeader", () => {
  it("starts in its scrolled style when the page opens part-way down", () => {
    // A reload mid-page or a /baan#reviews link: no scroll event comes after mounting.
    vi.spyOn(window, "scrollY", "get").mockReturnValue(600);
    render({ bookHref: "/baan/book" });
    const nav = container.querySelector("nav")!.className;
    // Solid white with a Sand border once scrolled: the old glass let content show through.
    expect(nav).toContain("bg-white");
    expect(nav).toContain("border-earth-200");
    expect(nav).not.toContain("glass-nav");
  });

  it("links the landing's Book button to the booking page", () => {
    render({ bookHref: "/baan/book" });
    expect(container.querySelector('a[href="/baan/book"]')).not.toBeNull();
  });

  it("drops the landing's Book button while the host can't take bookings", () => {
    render({ bookHref: "/baan/book", bookingDisabled: true });
    expect(container.querySelector('a[href="/baan/book"]')).toBeNull();
  });
});
