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

const render = (
  props: { bookHref?: string; bookingDisabled?: boolean; navItems?: { href: string; label: string }[]; resumeEnabled?: boolean } = {},
) =>
  act(() =>
    root.render(
      createElement(BookingHeader, { homestayName: "Baan", slug: "baan", homestayId: "homestay-1", ...props }),
    ),
  );
// The phone menu's trigger (common.menu on the landing); the sheet renders in a portal.
const openMenu = () => act(() => (container.querySelector('button[aria-label="menu"]') as HTMLButtonElement).click());
const menu = () => document.querySelector('[role="dialog"]');

describe("BookingHeader", () => {
  it("starts in its scrolled style when the page opens part-way down", () => {
    // A reload mid-page or a /baan#reviews link: no scroll event comes after mounting.
    vi.spyOn(window, "scrollY", "get").mockReturnValue(600);
    render({ bookHref: "/baan/book" });
    const nav = container.querySelector("nav")!.className;
    // Solid white with a Sand border once scrolled: the old glass let content show through.
    expect(nav).toContain("bg-white");
    expect(nav).toContain("border-line");
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

  it("offers Book inside the landing's phone menu, which covers the sticky Book bar", () => {
    render({ bookHref: "/baan/book" });
    openMenu();
    expect(menu()!.querySelector('a[href="/baan/book"]')?.textContent).toBe("bookHouse");
  });

  it("leaves Book out of the phone menu while the host can't take bookings", () => {
    render({ bookHref: "/baan/book", bookingDisabled: true });
    openMenu();
    expect(menu()).not.toBeNull();
    expect(menu()!.querySelector('a[href="/baan/book"]')).toBeNull();
  });

  // Owner, 2026-11-15: the landing's phone menu holds the booking tools, as on /book; its section links stay in the xl row.
  it("keeps the landing's section links in the header row, and gives its phone menu the booking tools instead", () => {
    render({ bookHref: "/baan/book", navItems: [{ href: "#about", label: "about" }, { href: "#reviews", label: "reviews" }] });
    expect(container.querySelector('nav a[href="#about"]')).not.toBeNull();
    openMenu();
    const links = [...menu()!.querySelectorAll("a")].map((a) => a.getAttribute("href"));
    expect(links).toEqual(["/baan/check-in-out", "/baan/change-booking", "/baan/reviews", "/baan/book"]);
  });

  it("gives the booking page the same tools, after a link back to the homestay's page", () => {
    render({ resumeEnabled: true });
    // On /book the phone menu's trigger is named "ตัวเลือกการจอง" (bookingMenu.aria); it comes before the desktop dropdown's.
    act(() => (container.querySelector('button[aria-label="aria"]') as HTMLButtonElement).click());
    const items = [...menu()!.querySelectorAll("a, button")]
      .map((el) => el.getAttribute("href") ?? el.textContent?.trim())
      .filter((v) => v !== "close" && v !== "");
    expect(items).toEqual(expect.arrayContaining(["/baan", "/baan/check-in-out", "/baan/change-booking", "resumeBooking", "/baan/reviews"]));
    expect(items.indexOf("/baan")).toBeLessThan(items.indexOf("/baan/check-in-out"));
  });
});
