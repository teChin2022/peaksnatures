import { describe, expect, it } from "vitest";
import {
  allowsNormal,
  allowsQuick,
  bookingCode,
  guestBookingModeOf,
  hostContactLink,
  isQuickPending,
} from "@/lib/quick-booking";

describe("guestBookingModeOf", () => {
  it("reads the three valid modes", () => {
    expect(guestBookingModeOf({ guest_booking_mode: "normal" })).toBe("normal");
    expect(guestBookingModeOf({ guest_booking_mode: "quick" })).toBe("quick");
    expect(guestBookingModeOf({ guest_booking_mode: "both" })).toBe("both");
  });

  it("falls back to normal for anything else, so an unmigrated row behaves as today", () => {
    expect(guestBookingModeOf(undefined)).toBe("normal");
    expect(guestBookingModeOf(null)).toBe("normal");
    expect(guestBookingModeOf({})).toBe("normal");
    expect(guestBookingModeOf({ guest_booking_mode: null })).toBe("normal");
    expect(guestBookingModeOf({ guest_booking_mode: "QUICK" })).toBe("normal");
    expect(guestBookingModeOf({ guest_booking_mode: "instant" })).toBe("normal");
  });
});

describe("allowsQuick / allowsNormal", () => {
  it("never leaves a host with both flows closed", () => {
    for (const mode of ["normal", "quick", "both"] as const) {
      expect(allowsQuick(mode) || allowsNormal(mode)).toBe(true);
    }
  });

  it("opens exactly the flows each mode names", () => {
    expect([allowsNormal("normal"), allowsQuick("normal")]).toEqual([true, false]);
    expect([allowsNormal("quick"), allowsQuick("quick")]).toEqual([false, true]);
    expect([allowsNormal("both"), allowsQuick("both")]).toEqual([true, true]);
  });
});

describe("isQuickPending", () => {
  const quick = { status: "pending", booking_source: "guest", easyslip_verified: false, payment_slip_hash: null };

  it("matches a guest quick booking waiting for the host", () => {
    expect(isQuickPending(quick)).toBe(true);
  });

  it("does not match a booking whose slip failed EasySlip (it keeps its hash)", () => {
    expect(isQuickPending({ ...quick, payment_slip_hash: "abc123" })).toBe(false);
  });

  it("does not match once the host has confirmed or cancelled", () => {
    expect(isQuickPending({ ...quick, status: "confirmed" })).toBe(false);
    expect(isQuickPending({ ...quick, status: "cancelled" })).toBe(false);
  });

  it("does not match a verified booking", () => {
    expect(isQuickPending({ ...quick, easyslip_verified: true })).toBe(false);
  });

  it("does not match a host-entered quick booking (confirmed, synthetic quick_<time> hash)", () => {
    expect(
      isQuickPending({
        status: "confirmed",
        booking_source: "walk_in",
        easyslip_verified: true,
        payment_slip_hash: "quick_1767225600000",
      }),
    ).toBe(false);
    expect(isQuickPending({ ...quick, booking_source: "phone" })).toBe(false);
  });
});

describe("bookingCode", () => {
  it("is the first 8 characters of the id, as the host messages print it", () => {
    expect(bookingCode("3f2a9c1e-0000-4000-8000-123456789abc")).toBe("3f2a9c1e");
  });
});

describe("hostContactLink", () => {
  const messenger = (name: string) => ({ href: `https://m.me/${name}`, kind: "messenger" });

  it("turns a page username into a Messenger link, whatever the facebook host", () => {
    expect(hostContactLink("https://www.facebook.com/ingkhoacamp")).toEqual(messenger("ingkhoacamp"));
    expect(hostContactLink("https://facebook.com/ingkhoacamp")).toEqual(messenger("ingkhoacamp"));
    expect(hostContactLink("https://m.facebook.com/ingkhoacamp")).toEqual(messenger("ingkhoacamp"));
    expect(hostContactLink("https://web.facebook.com/ingkhoacamp")).toEqual(messenger("ingkhoacamp"));
    expect(hostContactLink("https://fb.com/ingkhoacamp")).toEqual(messenger("ingkhoacamp"));
  });

  it("ignores a trailing slash, sub-path, query string and surrounding spaces", () => {
    expect(hostContactLink("  https://www.facebook.com/ingkhoacamp/  ")).toEqual(messenger("ingkhoacamp"));
    expect(hostContactLink("https://www.facebook.com/ingkhoacamp/about?ref=page")).toEqual(messenger("ingkhoacamp"));
  });

  it("accepts an address typed without a scheme, and http", () => {
    expect(hostContactLink("facebook.com/ingkhoacamp")).toEqual(messenger("ingkhoacamp"));
    expect(hostContactLink("http://facebook.com/ingkhoacamp")).toEqual(messenger("ingkhoacamp"));
  });

  it("keeps a link that is already a Messenger link", () => {
    expect(hostContactLink("https://m.me/ingkhoacamp")).toEqual(messenger("ingkhoacamp"));
  });

  it("uses the numeric id of a profile.php or id-only address", () => {
    expect(hostContactLink("https://www.facebook.com/profile.php?id=100012345678901")).toEqual(
      messenger("100012345678901"),
    );
    expect(hostContactLink("https://www.facebook.com/100012345678901")).toEqual(messenger("100012345678901"));
  });

  it("links to the page when the address is not a clean username", () => {
    expect(hostContactLink("https://www.facebook.com/Ing-Khoa-Camping-100012345678901")).toEqual({
      href: "https://www.facebook.com/Ing-Khoa-Camping-100012345678901",
      kind: "page",
    });
    expect(hostContactLink("https://www.facebook.com/pages/Ing-Khoa/123456789")).toEqual({
      href: "https://www.facebook.com/pages/Ing-Khoa/123456789",
      kind: "page",
    });
    expect(hostContactLink("https://www.facebook.com/profile.php?id=abc")).toEqual({
      href: "https://www.facebook.com/profile.php?id=abc",
      kind: "page",
    });
  });

  it("never treats a facebook.com section as a username", () => {
    expect(hostContactLink("https://www.facebook.com/groups/ingkhoa")?.kind).toBe("page");
    expect(hostContactLink("https://www.facebook.com/watch")?.kind).toBe("page");
    expect(hostContactLink("https://www.facebook.com/marketplace")?.kind).toBe("page");
  });

  it("returns null for nothing, bare facebook.com, other sites and non-web schemes", () => {
    expect(hostContactLink(null)).toBeNull();
    expect(hostContactLink(undefined)).toBeNull();
    expect(hostContactLink("")).toBeNull();
    expect(hostContactLink("   ")).toBeNull();
    expect(hostContactLink("https://www.facebook.com/")).toBeNull();
    expect(hostContactLink("https://www.instagram.com/ingkhoacamp")).toBeNull();
    expect(hostContactLink("https://notfacebook.com/ingkhoacamp")).toBeNull();
    expect(hostContactLink("https://facebook.com.evil.example/ingkhoacamp")).toBeNull();
    expect(hostContactLink("javascript:alert(1)")).toBeNull();
    expect(hostContactLink("not a url at all")).toBeNull();
  });
});
