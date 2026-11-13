// @vitest-environment happy-dom
import { Fragment, act, createElement, forwardRef, useEffect, type ComponentProps, type ComponentType, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BookingSection } from "@/components/booking/booking-section";
import { BookingCartProvider, useBookingCart, type CartLine } from "@/components/booking/booking-cart-context";
import { toBookingHost } from "@/lib/public-host";
import { makeHomestay, makeHost, makeRoom } from "../../../test/fixtures/db";
import type { GuestBookingMode } from "@/types/database";

// ── What this covers ────────────────────────────────────────────────────────
// The real BookingSection, driven from the cart to the payment step in a DOM, to
// pin which payment controls each host mode shows and what the form sends. The
// network is a fake and everything else (calendar, tutorial, animation, the
// province picker) is a stand-in, so it checks behaviour, not layout: a real
// browser run of the same flow is e2e/booking-flow.spec.ts.

const h = vi.hoisted(() => ({
  toastError: vi.fn(),
  trackDemand: vi.fn(),
}));

// Keys stand in for the copy; values are appended so they can be asserted.
vi.mock("next-intl", () => {
  const t = Object.assign(
    (key: string, values?: Record<string, unknown>) => (values ? `${key}:${Object.values(values).join(",")}` : key),
    { rich: (key: string) => key, has: () => false },
  );
  return { useTranslations: () => t, useLocale: () => "th" };
});
vi.mock("sonner", () => ({ toast: { error: h.toastError, success: vi.fn(), warning: vi.fn(), info: vi.fn() } }));
vi.mock("@/lib/demand-track", () => ({ trackDemand: h.trackDemand }));
vi.mock("@/lib/use-is-mobile", () => ({ useIsMobile: () => true }));
vi.mock("@/lib/prepare-slip", () => ({ prepareSlip: async (f: File) => f }));

// Animation is not under test, and AnimatePresence's exit wait would hold steps open.
vi.mock("motion/react", () => {
  const strip = ({ initial, animate, exit, transition, whileInView, whileHover, whileTap, viewport, variants, layout, layoutId, ...rest }: Record<string, unknown>) => {
    void [initial, animate, exit, transition, whileInView, whileHover, whileTap, viewport, variants, layout, layoutId];
    return rest;
  };
  const cache = new Map<string, unknown>();
  const motion = new Proxy({} as Record<string, unknown>, {
    get: (_t, tag: string) => {
      if (!cache.has(tag)) {
        cache.set(tag, forwardRef(function MotionStub(props: Record<string, unknown>, ref) { return createElement(tag, { ...strip(props), ref }); }));
      }
      return cache.get(tag);
    },
  });
  return { motion, AnimatePresence: ({ children }: { children: ReactNode }) => children, useInView: () => true, useReducedMotion: () => true };
});

// The province picker is a Radix Select; a native one is enough to choose a value.
vi.mock("@/components/ui/select", () => ({
  Select: ({ value, onValueChange, children }: { value: string; onValueChange: (v: string) => void; children: ReactNode }) =>
    createElement("select", { "data-testid": "province", value, onChange: (e: { target: { value: string } }) => onValueChange(e.target.value) }, createElement("option", { value: "" }), children),
  SelectTrigger: () => null,
  SelectValue: () => null,
  SelectContent: ({ children }: { children: ReactNode }) => children,
  SelectItem: ({ value, children }: { value: string; children: ReactNode }) => createElement("option", { value }, children),
}));

// Stand-ins for children that are not under test.
vi.mock("@/components/booking/booking-calendar-dialog", () => ({ BookingCalendarDialog: () => null }));
// Stands in for the dialog, but shows which version of the steps it was asked for.
vi.mock("@/components/booking/booking-tutorial-dialog", () => ({
  BookingTutorialDialog: ({ quickOnly }: { quickOnly?: boolean }) =>
    createElement("i", { "data-testid": "tutorial", "data-quick-only": String(!!quickOnly) }),
}));
vi.mock("@/components/booking/leave-booking-dialog", () => ({ LeaveBookingDialog: () => null }));
vi.mock("@/components/booking/cart-line-list", () => ({ CartLineList: () => null }));

// The Turnstile widget, loaded with next/dynamic: a button that passes the challenge.
vi.mock("next/dynamic", () => ({
  default: () =>
    function FakeTurnstile({ onSuccess }: { onSuccess: (token: string) => void }) {
      return createElement("button", { "data-testid": "turnstile", onClick: () => onSuccess("tok-1") }, "challenge");
    },
}));

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// ── Fixtures ────────────────────────────────────────────────────────────────
const HOMESTAY = makeHomestay({ id: "homestay-1", facebook_url: "https://www.facebook.com/ingkhoacamp" });
const ROOM_A = makeRoom({ id: "room-a", name: "Pine House", price_per_night: 1000 });
const ROOM_B = makeRoom({ id: "room-b", name: "Oak House", price_per_night: 1500 });
const CREATED_ID = "3f2a9c1e-0000-4000-8000-123456789abc";

const day = (offset: number) => {
  const d = new Date();
  d.setHours(12, 0, 0, 0);
  d.setDate(d.getDate() + offset);
  return d;
};

const line = (roomId: string): CartLine => ({ lineId: `line-${roomId}`, roomId, numGuests: 2, tierIds: [], optionIds: [] });

interface Calls {
  url: string;
  method: string;
  body: Record<string, unknown> | null;
}

let calls: Calls[];
let holdMs: number;
let responses: Record<string, () => Response | Promise<Response>>;
let container: HTMLDivElement;
let root: Root;

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

beforeEach(() => {
  calls = [];
  holdMs = 10 * 60_000;
  responses = {};
  h.toastError.mockClear();

  vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const method = init?.method ?? "GET";
    const body = typeof init?.body === "string" ? JSON.parse(init.body) : null;
    calls.push({ url, method, body });
    const key = `${method} ${url.split("?")[0]}`;
    if (responses[key]) return responses[key]();
    if (key === "POST /api/bookings/hold") return json({ hold_id: "hold-1", expires_at: new Date(Date.now() + holdMs).toISOString() });
    if (key === "POST /api/verify-slip")
      return json({ verified: true, slip_hash: "hash-1", slip_trans_ref: "TR1", payment_slip_url: "pending/x.jpg", easyslip_response: { ok: true } });
    if (key === "POST /api/bookings") return json({ booking: { id: CREATED_ID } }, 201);
    if (key === "POST /api/bookings/group") return json({ group: { id: CREATED_ID }, bookings: [{ id: "m1" }] }, 201);
    if (key === "GET /api/bookings/availability") return json({ bookedRanges: [] });
    if (url.startsWith("/api/slip-upload")) return json({}, 404);
    return json({});
  });

  // Browser APIs the form touches that happy-dom leaves out.
  Element.prototype.scrollIntoView = vi.fn();
  vi.stubGlobal("IntersectionObserver", class { observe() {} unobserve() {} disconnect() {} });
  URL.createObjectURL = vi.fn(() => "blob:slip");
  URL.revokeObjectURL = vi.fn();

  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  document.body.innerHTML = "";
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

// ── Driving the form ────────────────────────────────────────────────────────
function Seed({ rooms }: { rooms: string[] }) {
  const cart = useBookingCart();
  useEffect(() => {
    cart.setDates({ from: day(40), to: day(42) });
    for (const id of rooms) cart.addLine(line(id));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return null;
}

async function renderForm(mode: GuestBookingMode, rooms: string[] = [ROOM_A.id], over: { facebook_url?: string | null; phone?: string | null } = {}) {
  const homestay = { ...HOMESTAY, facebook_url: over.facebook_url === undefined ? HOMESTAY.facebook_url : over.facebook_url };
  const host = toBookingHost(
    makeHost({ guest_booking_mode: mode, promptpay_id: "0812345678", phone: over.phone === undefined ? "0812345678" : over.phone }),
  );
  const catalog = { rooms: [ROOM_A, ROOM_B], seasonalPrices: [], specialPrices: [], roomOptions: [], guestPricing: [], blockedDates: [], bookedRanges: [] };
  const { homestay: _h, ...forClient } = { ...homestay, host: null } as never as { homestay: never } & Record<string, unknown>;
  void _h;
  await act(async () => {
    root.render(
      createElement(
        BookingCartProvider as ComponentType<Omit<ComponentProps<typeof BookingCartProvider>, "children">>,
        { catalog, homestayId: HOMESTAY.id },
        createElement(
          Fragment,
          null,
          createElement(Seed, { rooms }),
          createElement(BookingSection, {
            homestay: forClient as never,
            rooms: [ROOM_A, ROOM_B],
            blockedDates: [],
            host,
            bookingDisabled: false,
          }),
        ),
      ),
    );
  });
}

const text = () => document.body.textContent ?? "";
const buttons = () => [...document.body.querySelectorAll("button")];
const buttonByText = (needle: string) => buttons().find((b) => b.textContent?.includes(needle));
const waitForText = (needle: string, timeout = 3000) => vi.waitFor(() => expect(text()).toContain(needle), { timeout });

async function click(el: Element | undefined | null) {
  expect(el, "element to click").toBeTruthy();
  await act(async () => (el as HTMLElement).click());
}

async function type(selector: string, value: string) {
  const el = document.body.querySelector<HTMLInputElement | HTMLSelectElement>(selector)!;
  expect(el, selector).toBeTruthy();
  const proto = el instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
  await act(async () => {
    Object.getOwnPropertyDescriptor(proto, "value")!.set!.call(el, value);
    el.dispatchEvent(new Event(el instanceof HTMLSelectElement ? "change" : "input", { bubbles: true }));
  });
}

/** Step 1: consent, then on to the guest details. */
async function toDetails() {
  await vi.waitFor(() => expect(buttonByText("continueDetails")).toBeTruthy());
  await click(document.body.querySelector('input[type="checkbox"]'));
  await click(buttonByText("continueDetails"));
}

interface Details {
  name: string;
  email: string;
  phone: string;
  province: boolean;
}

/** Fills step 2. An empty string, or `province: false`, leaves that field untouched. */
async function fillDetails(over: Partial<Details> = {}) {
  const d: Details = { name: "Nok Suwan", email: "guest@example.com", phone: "0898765432", province: true, ...over };
  if (d.name) await type("#bk-name", d.name);
  if (d.email) await type("#bk-email", d.email);
  if (d.phone) await type("#bk-phone", d.phone);
  if (d.province) {
    const option = document.body.querySelector<HTMLOptionElement>('[data-testid="province"] option[value]:not([value=""])')!;
    await type('[data-testid="province"]', option.value);
  }
}

/** Step 1 → 2 → 3: consent, guest details, the review, then the room holds. */
async function reachPayment(details: Partial<Details> = {}) {
  await toDetails();
  await fillDetails(details);
  await click(buttonByText("continuePayment"));
  await click(buttonByText("confirmProceed"));
  await waitForText("paymentTitle");
}

const bookingPosts = () => calls.filter((c) => c.method === "POST" && /^\/api\/bookings(\/group)?$/.test(c.url));

// ── The guest details form ──────────────────────────────────────────────────
describe("the guest details step", () => {
  const holdsRequested = () => calls.filter((c) => c.method === "POST" && c.url === "/api/bookings/hold");

  it("does not mark the province as required", async () => {
    await renderForm("normal");
    await toDetails();

    const label = document.body.querySelector('label[for="bk-province"]')!;
    expect(label.textContent).toContain("province");
    expect(label.textContent).not.toContain("*");
    // The other three still are.
    for (const id of ["bk-name", "bk-email", "bk-phone"]) {
      expect(document.body.querySelector(`label[for="${id}"]`)?.textContent).toContain("*");
    }
  });

  it("lets a guest go on to payment without choosing a province, and sends none", async () => {
    await renderForm("quick");
    await reachPayment({ province: false });

    await click(buttonByText("quickSubmit"));
    await waitForText("quickPlacedTitle");

    expect(bookingPosts()[0].body).not.toHaveProperty("guest_province");
    expect(text()).not.toContain("fieldRequired");
  });

  it("still sends the province when the guest chooses one", async () => {
    await renderForm("quick");
    await reachPayment();
    await click(buttonByText("quickSubmit"));
    await waitForText("quickPlacedTitle");

    expect(bookingPosts()[0].body).toHaveProperty("guest_province", expect.any(String));
  });

  it.each([
    ["name", { name: "" }],
    ["email", { email: "" }],
    ["phone", { phone: "" }],
  ] as const)("still stops a guest who leaves out the %s, before any room is held", async (_field, over) => {
    await renderForm("normal");
    await toDetails();
    await fillDetails(over);
    await click(buttonByText("continuePayment"));

    expect(text()).toContain("fieldRequired");
    expect(buttonByText("confirmProceed")).toBeUndefined();
    expect(holdsRequested()).toHaveLength(0);
  });
});

// ── The payment step, per host mode ─────────────────────────────────────────
describe("how booking works, above the form", () => {
  const tutorialQuickOnly = () => document.body.querySelector('[data-testid="tutorial"]')?.getAttribute("data-quick-only");

  it("promises the automatic slip check to a host on the normal flow", async () => {
    await renderForm("normal");
    expect(text()).toContain("howItWorks");
    expect(text()).not.toContain("howItWorksQuick");
    expect(tutorialQuickOnly()).toBe("false");
  });

  it("tells a guest of a quick-only host to send the slip in chat and wait for the host", async () => {
    await renderForm("quick");
    expect(text()).toContain("howItWorksQuick");
    expect(tutorialQuickOnly()).toBe("true");
  });

  it("keeps the normal wording for a host still saved on both, whose slip upload still works", async () => {
    await renderForm("both");
    expect(text()).not.toContain("howItWorksQuick");
    expect(tutorialQuickOnly()).toBe("false");
  });
});

describe("BookingSection payment step", () => {
  it("offers only the slip upload to a host on the normal flow", async () => {
    await renderForm("normal");
    await reachPayment();

    expect(buttonByText("iveTransferred")).toBeTruthy();
    expect(buttonByText("quickSubmit")).toBeUndefined();
    expect(text()).toContain("payStep4");
    expect(text()).not.toContain("quickPayStep4");
    expect(text()).not.toContain("quickNoSlipTitle");
  });

  it("offers only 'I have transferred — place booking' to a host on quick, with no upload step", async () => {
    await renderForm("quick");
    await reachPayment();

    expect(buttonByText("quickSubmit")).toBeTruthy();
    expect(buttonByText("iveTransferred")).toBeUndefined();
    expect(text()).toContain("quickPayStep4");
    // Says up front that no slip is uploaded here and that it goes to the host in chat.
    expect(text()).toContain("quickNoSlipTitle");
    expect(text()).toContain("quickNoSlipDesc");
  });

  it("keeps the slip upload first and adds the quick way as a second choice, for a host on both", async () => {
    await renderForm("both");
    await reachPayment();

    expect(buttonByText("iveTransferred")).toBeTruthy();
    expect(buttonByText("quickSubmitAlt")).toBeTruthy();
    expect(buttonByText("quickSubmit")?.textContent).toBe("quickSubmitAlt");
    expect(text()).not.toContain("quickNoSlipTitle");
  });
});

describe("placing a quick booking", () => {
  it("sends no slip, only the quick flag, and shows the code, the amount and the way to reach the host", async () => {
    await renderForm("quick");
    await reachPayment();
    await click(buttonByText("quickSubmit"));
    await waitForText("quickPlacedTitle");

    const posts = bookingPosts();
    expect(posts).toHaveLength(1);
    expect(posts[0].url).toBe("/api/bookings");
    expect(posts[0].body).toMatchObject({
      homestay_id: "homestay-1",
      room_id: "room-a",
      guest_email: "guest@example.com",
      quick: true,
      easyslip_verified: false,
      total_price: 2000,
    });
    for (const key of ["slip_hash", "slip_trans_ref", "payment_slip_url", "easyslip_response"]) {
      expect(posts[0].body).not.toHaveProperty(key);
    }
    expect(calls.some((c) => c.url === "/api/verify-slip")).toBe(false);

    expect(text()).toContain("3f2a9c1e");
    expect(text()).toContain("amountToTransfer");
    expect(document.body.querySelector('a[href="https://m.me/ingkhoacamp"]')).toBeTruthy();
    expect(document.body.querySelector('a[href="tel:0812345678"]')).toBeTruthy();
  });

  it("books several houses through the cart route, quoting the cart's code", async () => {
    await renderForm("quick", [ROOM_A.id, ROOM_B.id]);
    await reachPayment();
    await click(buttonByText("quickSubmit"));
    await waitForText("quickPlacedTitle");

    const posts = bookingPosts();
    expect(posts).toHaveLength(1);
    expect(posts[0].url).toBe("/api/bookings/group");
    expect(posts[0].body).toMatchObject({ quick: true, easyslip_verified: false });
    expect((posts[0].body?.items as unknown[]).length).toBe(2);
    expect(posts[0].body).not.toHaveProperty("slip_hash");
    expect(text()).toContain("3f2a9c1e");
  });

  it("works from the second choice for a host on both", async () => {
    await renderForm("both");
    await reachPayment();
    await click(buttonByText("quickSubmitAlt"));
    await waitForText("quickPlacedTitle");

    expect(bookingPosts()[0].body).toMatchObject({ quick: true, easyslip_verified: false });
  });

  it("falls back to the host's phone when the homestay has no Facebook link", async () => {
    await renderForm("quick", [ROOM_A.id], { facebook_url: null });
    await reachPayment();
    await click(buttonByText("quickSubmit"));
    await waitForText("quickPlacedTitle");

    expect(document.body.querySelector('a[href^="https://m.me"]')).toBeNull();
    expect(document.body.querySelector('a[href="tel:0812345678"]')).toBeTruthy();
  });

  it("says the host will call when there is neither a link nor a phone", async () => {
    await renderForm("quick", [ROOM_A.id], { facebook_url: null, phone: null });
    await reachPayment();
    await click(buttonByText("quickSubmit"));
    await waitForText("quickPlacedTitle");

    expect(text()).toContain("hostContactNone");
  });

  it("lets go of its own hold once the booking is placed, as the normal flow does", async () => {
    await renderForm("quick");
    await reachPayment();
    await click(buttonByText("quickSubmit"));
    await waitForText("quickPlacedTitle");

    const order = calls.map((c) => `${c.method} ${c.url}`);
    const released = order.indexOf("DELETE /api/bookings/hold");
    expect(released).toBeGreaterThan(order.indexOf("POST /api/bookings"));
    expect(calls[released].body).toMatchObject({ session_id: expect.any(String) });
  });
});

describe("when the server turns a quick booking down", () => {
  const refuse = (status: number, code?: string) => {
    responses["POST /api/bookings"] = () => json(code ? { error: "no", code } : { error: "no" }, status);
  };

  it.each([
    ["too many waiting", 429, "TOO_MANY_PENDING", "errorQuickPendingLimit"],
    ["the host changed the mode", 403, "NORMAL_NOT_ENABLED", "errorBookingModeChanged"],
    ["the host closed quick booking", 403, "QUICK_NOT_ENABLED", "errorBookingModeChanged"],
    ["Turnstile rejected the token", 403, "TURNSTILE_FAILED", "errorVerification"],
    ["the rate limiter", 429, undefined, "errorTooManyRequests"],
  ])("explains %s, and keeps the guest on the payment step", async (_label, status, code, message) => {
    await renderForm("quick");
    await reachPayment();
    refuse(status, code);
    await click(buttonByText("quickSubmit"));

    await vi.waitFor(() => expect(h.toastError).toHaveBeenCalledWith(message));
    expect(text()).not.toContain("quickPlacedTitle");
    expect(buttonByText("quickSubmit")).toBeTruthy();
  });

  it("reports a clash of dates and sends the guest back to choose again", async () => {
    await renderForm("quick");
    await reachPayment();
    refuse(409);
    await click(buttonByText("quickSubmit"));

    await vi.waitFor(() => expect(h.toastError).toHaveBeenCalledWith("errorDatesUnavailable"));
    await vi.waitFor(() => expect(buttonByText("continueDetails")).toBeTruthy());
  });

  it("shows a generic error for anything else", async () => {
    await renderForm("quick");
    await reachPayment();
    refuse(500);
    await click(buttonByText("quickSubmit"));

    await vi.waitFor(() => expect(h.toastError).toHaveBeenCalledWith("errorGeneric"));
  });
});

describe("Turnstile for a quick booking", () => {
  it("holds the quick button until the challenge passes, then sends the token", async () => {
    vi.stubEnv("NEXT_PUBLIC_TURNSTILE_SITE_KEY", "site-key");
    await renderForm("quick");
    await reachPayment();

    expect((buttonByText("quickSubmit") as HTMLButtonElement).disabled).toBe(true);

    await click(document.body.querySelector('[data-testid="turnstile"]'));
    expect((buttonByText("quickSubmit") as HTMLButtonElement).disabled).toBe(false);

    await click(buttonByText("quickSubmit"));
    await waitForText("quickPlacedTitle");
    expect(bookingPosts()[0].body).toMatchObject({ turnstile_token: "tok-1" });
  });

  it("stops waiting after a few seconds when the widget never answers, and books without a token", async () => {
    vi.stubEnv("NEXT_PUBLIC_TURNSTILE_SITE_KEY", "site-key");
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      await renderForm("quick");
      await reachPayment();
      expect((buttonByText("quickSubmit") as HTMLButtonElement).disabled).toBe(true);

      // Cloudflare unreachable: the widget is on screen but never reports back.
      await act(async () => {
        vi.advanceTimersByTime(9000);
      });
      expect((buttonByText("quickSubmit") as HTMLButtonElement).disabled).toBe(false);
      expect(document.body.querySelector('[data-testid="turnstile"]')).toBeNull();

      await click(buttonByText("quickSubmit"));
      await waitForText("quickPlacedTitle");
      expect(bookingPosts()[0].body).not.toHaveProperty("turnstile_token");
    } finally {
      vi.useRealTimers();
    }
  });

  it("does not give up while the guest is still within the wait", async () => {
    vi.stubEnv("NEXT_PUBLIC_TURNSTILE_SITE_KEY", "site-key");
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      await renderForm("quick");
      await reachPayment();
      await act(async () => {
        vi.advanceTimersByTime(5000);
      });
      expect((buttonByText("quickSubmit") as HTMLButtonElement).disabled).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it("needs no challenge, and sends no token, when Turnstile is not configured", async () => {
    await renderForm("quick");
    await reachPayment();

    expect(document.body.querySelector('[data-testid="turnstile"]')).toBeNull();
    expect((buttonByText("quickSubmit") as HTMLButtonElement).disabled).toBe(false);
    await click(buttonByText("quickSubmit"));
    await waitForText("quickPlacedTitle");
    expect(bookingPosts()[0].body).not.toHaveProperty("turnstile_token");
  });

  it("never loads the widget for a host on the normal flow", async () => {
    vi.stubEnv("NEXT_PUBLIC_TURNSTILE_SITE_KEY", "site-key");
    await renderForm("normal");
    await reachPayment();

    expect(document.body.querySelector('[data-testid="turnstile"]')).toBeNull();
  });
});

// ── The normal flow, unchanged ──────────────────────────────────────────────
describe("the slip-verified booking, after the creation code was shared with quick", () => {
  async function uploadAndSubmit() {
    await click(buttonByText("iveTransferred"));
    await waitForText("waitingForSlip");

    const input = document.body.querySelector<HTMLInputElement>('input[type="file"]')!;
    const file = new File(["x"], "slip.jpg", { type: "image/jpeg" });
    Object.defineProperty(input, "files", { value: [file], configurable: true });
    await act(async () => {
      input.dispatchEvent(new Event("change", { bubbles: true }));
    });
    await vi.waitFor(() => expect((buttonByText("submitBooking") as HTMLButtonElement).disabled).toBe(false));
    await click(buttonByText("submitBooking"));
  }

  it("verifies the slip first, then books one house with the slip fields and no quick flag", async () => {
    await renderForm("normal");
    await reachPayment();
    await uploadAndSubmit();
    await waitForText("confirmedTitle");

    const order = calls.map((c) => c.url);
    expect(order.indexOf("/api/verify-slip")).toBeGreaterThan(-1);
    expect(order.indexOf("/api/verify-slip")).toBeLessThan(order.indexOf("/api/bookings"));

    const [post] = bookingPosts();
    expect(post.url).toBe("/api/bookings");
    expect(post.body).toMatchObject({
      slip_hash: "hash-1",
      slip_trans_ref: "TR1",
      payment_slip_url: "pending/x.jpg",
      easyslip_verified: true,
      room_id: "room-a",
    });
    expect(post.body).not.toHaveProperty("quick");
    expect(post.body).not.toHaveProperty("turnstile_token");
    expect(text()).not.toContain("quickPlacedTitle");
  });

  it("books several houses through the cart route the same way", async () => {
    await renderForm("both", [ROOM_A.id, ROOM_B.id]);
    await reachPayment();
    await uploadAndSubmit();
    await waitForText("confirmedTitle");

    const [post] = bookingPosts();
    expect(post.url).toBe("/api/bookings/group");
    expect(post.body).toMatchObject({ slip_hash: "hash-1", easyslip_verified: true });
    expect(post.body).not.toHaveProperty("quick");
  });

  it("records a slip EasySlip could not verify as the pending outcome, not as a quick booking", async () => {
    responses["POST /api/verify-slip"] = () => json({ verified: false, slip_hash: "hash-2", payment_slip_url: null });
    await renderForm("normal");
    await reachPayment();
    await uploadAndSubmit();
    await waitForText("confirmedTitlePending");

    expect(bookingPosts()[0].body).toMatchObject({ easyslip_verified: false, slip_hash: "hash-2" });
    expect(bookingPosts()[0].body).not.toHaveProperty("quick");
    expect(text()).not.toContain("quickPlacedTitle");
  });
});

// ── The hold running out ────────────────────────────────────────────────────
describe("when the 10-minute hold runs out on the payment step", () => {
  it("tells a guest of a quick-capable host to contact the host in case they already transferred", async () => {
    holdMs = 1500;
    await renderForm("quick");
    await reachPayment();

    await waitForText("quickExpiredTitle", 5000);
    expect(document.body.querySelector('a[href="https://m.me/ingkhoacamp"]')).toBeTruthy();
    expect(h.toastError).toHaveBeenCalledWith("holdExpired");
  });

  it("does the same for a host on both", async () => {
    holdMs = 1500;
    await renderForm("both");
    await reachPayment();
    await waitForText("quickExpiredTitle", 5000);
  });

  it("only returns to the dates, as before, for a host on the normal flow", async () => {
    holdMs = 1500;
    await renderForm("normal");
    await reachPayment();

    await vi.waitFor(() => expect(h.toastError).toHaveBeenCalledWith("holdExpired"), { timeout: 5000 });
    expect(text()).not.toContain("quickExpiredTitle");
  });
});
