import { expect, test, type Locator, type Page } from "@playwright/test";
import {
  CREATED_ID,
  T,
  bookingPosts,
  expectNoUnexpectedWrites,
  reachPayment,
  requireSlug,
  startSession,
  type HostMode,
  type Session,
} from "./support";

/**
 * The guest booking flow in a real browser, up to and including placing the
 * booking. The host's mode is set per test by rewriting the page's own payload
 * (see support.ts), so the database needs no set-up and nothing is written:
 * every API write is stubbed, and the test fails if one was not.
 *
 * Unit tests (src/components/booking/booking-section.test.ts) cover the same
 * logic in a DOM; this checks it in the real page, at phone and desktop widths.
 */

// A real 1x1 PNG: the form compresses the slip through a canvas before sending it.
const SLIP_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==",
  "base64",
);
const CODE = CREATED_ID.slice(0, 8);

let session: Session;

async function open(
  page: Page,
  context: Parameters<typeof startSession>[1],
  mode: HostMode,
  options: { holdMs?: number; turnstile?: "pass" | "blocked" } = {},
) {
  session = await startSession(page, context, { mode, ...options });
  return session;
}

test.afterEach(() => {
  // Whatever a test checked, it must not have written anything it did not stub.
  if (session) expectNoUnexpectedWrites(session);
});

test.describe("the guest details step", () => {
  test("lets a guest book without choosing a province", async ({ page, context }) => {
    const slug = requireSlug();
    await open(page, context, "quick");
    await reachPayment(page, slug, { province: false });

    await expect(page.locator('label[for="bk-province"] span.text-red-500')).toHaveCount(0);
    await page.getByRole("button", { name: T.booking.quickSubmit }).click();
    await expect(page.getByRole("dialog").getByText(T.booking.quickPlacedTitle)).toBeVisible();
    expect(bookingPosts(session)[0].body).not.toHaveProperty("guest_province");
  });

  test("still sends the province when the guest chooses one", async ({ page, context }) => {
    const slug = requireSlug();
    await open(page, context, "quick");
    await reachPayment(page, slug);
    await page.getByRole("button", { name: T.booking.quickSubmit }).click();
    await expect(page.getByRole("dialog").getByText(T.booking.quickPlacedTitle)).toBeVisible();
    expect(bookingPosts(session)[0].body).toHaveProperty("guest_province", expect.any(String));
  });
});

test.describe("a host on the normal flow", () => {
  test("keeps the slip upload, with no quick booking anywhere", async ({ page, context }) => {
    const slug = requireSlug();
    await open(page, context, "normal");
    await reachPayment(page, slug);

    // The slip upload is on the payment page itself, with no "I have transferred" screen first.
    await expect(page.getByRole("button", { name: T.booking.submitBooking })).toBeVisible();
    await expect(page.getByRole("button", { name: T.booking.iveTransferred })).toHaveCount(0);
    await expect(page.getByRole("button", { name: T.booking.quickSubmit })).toHaveCount(0);
    await expect(page.getByRole("button", { name: T.booking.quickSubmitAlt })).toHaveCount(0);
  });

  test("verifies the slip, then books with the slip fields and no quick flag", async ({ page, context }) => {
    const slug = requireSlug();
    await open(page, context, "normal");
    await reachPayment(page, slug);

    await page.locator('input[type="file"]').setInputFiles({ name: "slip.png", mimeType: "image/png", buffer: SLIP_PNG });
    await expect(page.getByRole("button", { name: T.booking.submitBooking })).toBeEnabled();
    await page.getByRole("button", { name: T.booking.submitBooking }).click();

    await expect(page.getByRole("dialog").getByText(T.booking.confirmedTitle)).toBeVisible();

    const paths = session.calls.map((c) => c.path);
    expect(paths.indexOf("/api/verify-slip")).toBeGreaterThan(-1);
    expect(paths.indexOf("/api/verify-slip")).toBeLessThan(paths.indexOf("/api/bookings"));

    const [post] = bookingPosts(session);
    expect(post.path).toBe("/api/bookings");
    expect(post.body).toMatchObject({ slip_hash: "hash-e2e", easyslip_verified: true });
    expect(post.body).not.toHaveProperty("quick");
  });
});

test.describe("a host on quick booking only", () => {
  test("has no slip upload: one button places the booking", async ({ page, context }) => {
    const slug = requireSlug();
    await open(page, context, "quick");
    await reachPayment(page, slug);

    await expect(page.getByRole("button", { name: T.booking.quickSubmit })).toBeVisible();
    await expect(page.getByRole("button", { name: T.booking.iveTransferred })).toHaveCount(0);
    await expect(page.getByText(T.booking.quickPayStep4)).toBeVisible();
    await expect(page.getByText(T.booking.quickNoSlipTitle)).toBeVisible();
    await expect(page.getByText(T.booking.quickNoSlipDesc)).toBeVisible();
  });

  test("places the booking with no slip, and tells the guest what to do next", async ({ page, context }) => {
    const slug = requireSlug();
    await open(page, context, "quick");
    await reachPayment(page, slug);
    await page.getByRole("button", { name: T.booking.quickSubmit }).click();

    const dialog = page.getByRole("dialog");
    await expect(dialog.getByText(T.booking.quickPlacedTitle)).toBeVisible();
    await expect(dialog.getByText(CODE)).toBeVisible();
    await expect(dialog.getByText(T.booking.amountToTransfer)).toBeVisible();
    // However the homestay set up its contacts, the guest is given a way to reach the host.
    await expect(dialog.locator('a[href^="https://m.me"], a[href^="https://www.facebook.com"], a[href^="tel:"]').first().or(dialog.getByText(T.booking.hostContactNone))).toBeVisible();

    const posts = bookingPosts(session);
    expect(posts).toHaveLength(1);
    expect(posts[0].body).toMatchObject({ quick: true, easyslip_verified: false });
    for (const key of ["slip_hash", "slip_trans_ref", "payment_slip_url", "easyslip_response"]) {
      expect(posts[0].body).not.toHaveProperty(key);
    }
    expect(session.calls.some((c) => c.path === "/api/verify-slip")).toBe(false);
  });

  test("sends the Turnstile token once the challenge passes", async ({ page, context }) => {
    const slug = requireSlug();
    await open(page, context, "quick");
    await reachPayment(page, slug);
    // The widget is loaded on demand, so give it a moment to render before deciding there is none.
    const widgetUsed = await page
      .waitForFunction(() => Boolean((window as { __turnstileRendered?: boolean }).__turnstileRendered), null, { timeout: 5_000 })
      .then(() => true, () => false);
    test.skip(!widgetUsed, "NEXT_PUBLIC_TURNSTILE_SITE_KEY is not set here, so there is no challenge to pass");

    await page.getByRole("button", { name: T.booking.quickSubmit }).click();
    await expect(page.getByRole("dialog").getByText(T.booking.quickPlacedTitle)).toBeVisible();
    expect(bookingPosts(session)[0].body).toMatchObject({ turnstile_token: "e2e-token" });
  });

  test("still books when Cloudflare cannot be reached, without a token", async ({ page, context }) => {
    const slug = requireSlug();
    await open(page, context, "quick", { turnstile: "blocked" });
    await reachPayment(page, slug);

    // The button waits a few seconds for a challenge that never arrives, then goes ahead.
    await expect(page.getByRole("button", { name: T.booking.quickSubmit })).toBeEnabled({ timeout: 20_000 });
    await page.getByRole("button", { name: T.booking.quickSubmit }).click();

    await expect(page.getByRole("dialog").getByText(T.booking.quickPlacedTitle)).toBeVisible();
    expect(bookingPosts(session)[0].body).not.toHaveProperty("turnstile_token");
  });

  test("books several houses through the cart route", async ({ page, context }) => {
    const slug = requireSlug();
    await open(page, context, "quick");
    await reachPayment(page, slug, { houses: 2 });
    await page.getByRole("button", { name: T.booking.quickSubmit }).click();

    await expect(page.getByRole("dialog").getByText(T.booking.quickPlacedTitle)).toBeVisible();
    const [post] = bookingPosts(session);
    expect(post.path).toBe("/api/bookings/group");
    expect(post.body).toMatchObject({ quick: true, easyslip_verified: false });
    expect((post.body?.items as unknown[]).length).toBe(2);
  });

  test("explains a refusal and leaves the guest on the payment step", async ({ page, context }) => {
    const slug = requireSlug();
    const s = await open(page, context, "quick");
    await reachPayment(page, slug);
    s.respond("POST /api/bookings", { status: 429, body: { error: "no", code: "TOO_MANY_PENDING" } });
    await page.getByRole("button", { name: T.booking.quickSubmit }).click();

    await expect(page.getByText(T.booking.errorQuickPendingLimit)).toBeVisible();
    // No dialog opened over the checkout (which is itself a dialog, data-checkout).
    await expect(page.locator('[role="dialog"]:not([data-checkout])')).toHaveCount(0);
    await expect(page.getByRole("button", { name: T.booking.quickSubmit })).toBeEnabled();
  });

  test("shows the expired page with the host's contact when the hold runs out, in case the guest already transferred", async ({ page, context }) => {
    const slug = requireSlug();
    await open(page, context, "quick", { holdMs: 5000 });
    await reachPayment(page, slug);

    await expect(page.getByRole("dialog").getByText(T.booking.quickExpiredTitle)).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole("dialog").getByText(T.booking.holdExpiredReleased)).toBeVisible();
  });
});

test.describe("a host on both", () => {
  test("keeps the upload first and offers the quick way as a second choice", async ({ page, context }) => {
    const slug = requireSlug();
    await open(page, context, "both");
    await reachPayment(page, slug);

    await expect(page.getByRole("button", { name: T.booking.submitBooking })).toBeVisible();
    await expect(page.getByRole("button", { name: T.booking.quickSubmitAlt })).toBeVisible();
  });

  test("the second choice places a quick booking", async ({ page, context }) => {
    const slug = requireSlug();
    await open(page, context, "both");
    await reachPayment(page, slug);
    await page.getByRole("button", { name: T.booking.quickSubmitAlt }).click();

    await expect(page.getByRole("dialog").getByText(T.booking.quickPlacedTitle)).toBeVisible();
    expect(bookingPosts(session)[0].body).toMatchObject({ quick: true, easyslip_verified: false });
  });
});

test.describe("the booking page header", () => {
  test("shows only the name and tagline, centred, and stays put while the guest scrolls to the dates", async ({ page, context }) => {
    const slug = requireSlug();
    await open(page, context, "normal");
    await page.goto(`/${slug}/book`);

    const name = page.getByRole("heading", { level: 1 });
    await expect(name).toBeVisible();
    const hero = page.locator("section").filter({ has: name });
    // Nothing else in the header: no rating, badges, promise or links.
    await expect(hero.getByRole("link")).toHaveCount(0);
    await expect(hero.locator("svg")).toHaveCount(0);
    // Measure the glyphs, not the h1's box: a left-aligned h1 can still span a centred column.
    const offCentre = await name.evaluate((el) => {
      const range = document.createRange();
      range.selectNodeContents(el);
      const r = range.getBoundingClientRect();
      return Math.abs(r.left + r.width / 2 - document.documentElement.clientWidth / 2);
    });
    expect(offCentre).toBeLessThanOrEqual(4);

    // The header used to fade out with the scroll and drift with a parallax photo.
    await page.mouse.wheel(0, 300);
    await page.waitForTimeout(300);
    expect(await name.evaluate((el) => getComputedStyle(el.closest("section > div:last-child")!).opacity)).toBe("1");
  });
});

test.describe("on a phone", () => {
  test("neither the payment step nor the confirmation overflows the screen sideways", async ({ page, context }, testInfo) => {
    test.skip(testInfo.project.name !== "phone", "phone layout only");
    const slug = requireSlug();
    await open(page, context, "both");
    await reachPayment(page, slug);

    const overflow = () => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(await overflow()).toBeLessThanOrEqual(0);

    await page.getByRole("button", { name: T.booking.quickSubmitAlt }).click();
    await expect(page.getByRole("dialog").getByText(T.booking.quickPlacedTitle)).toBeVisible();
    expect(await overflow()).toBeLessThanOrEqual(0);

    // The done page is long on a phone: it must stay inside the screen and scroll,
    // or its title and its buttons end up out of reach.
    const dialog = page.getByRole("dialog");
    const box = (await dialog.boundingBox())!;
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(375);
    expect(box.y).toBeGreaterThanOrEqual(0);
    expect(box.y + box.height).toBeLessThanOrEqual(812);

    await expect(dialog.getByText(T.booking.quickPlacedTitle)).toBeInViewport();
    const close = dialog.getByRole("button", { name: T.booking.backToHomestay, exact: true });
    await close.scrollIntoViewIfNeeded();
    await expect(close).toBeInViewport();
  });
});

test.describe("a host who changed the mode while the page was open", () => {
  test("a stale page that tries the other way is told to refresh", async ({ page, context }) => {
    const slug = requireSlug();
    const s = await open(page, context, "quick");
    await reachPayment(page, slug);
    s.respond("POST /api/bookings", { status: 403, body: { error: "no", code: "QUICK_NOT_ENABLED" } });
    await page.getByRole("button", { name: T.booking.quickSubmit }).click();

    await expect(page.getByText(T.booking.errorBookingModeChanged)).toBeVisible();
  });
});

test.describe("the checkout overlay", () => {
  const overlay = (page: Page) => page.locator('[data-checkout="open"]');
  // An open Radix dialog turns pointer events off on <body>, so a click goes through a covering
  // overlay and proves nothing. Both sit in the page's root stacking context, so z-index decides.
  const zIndex = (l: Locator) => l.evaluate((el) => Number(getComputedStyle(el).zIndex));
  const expectAbove = async (dialog: Locator, page: Page) =>
    expect(await zIndex(dialog)).toBeGreaterThan(await zIndex(overlay(page)));

  test("covers the screen under the site header for details and payment, and ends on the done page", async ({ page, context }) => {
    const slug = requireSlug();
    await open(page, context, "normal");
    // Choosing a province on the way needs the dropdown above the overlay: a covered option can't be clicked.
    await reachPayment(page, slug);

    await expect(overlay(page)).toBeVisible();
    const box = await overlay(page).boundingBox();
    const viewport = page.viewportSize()!;
    // Full width and down to the bottom; its top is the site header's bottom edge.
    const header = (await page.locator("nav").first().boundingBox())!;
    expect(box!.x).toBe(0);
    expect(box!.width).toBe(viewport.width);
    expect(Math.abs(box!.y - (header.y + header.height))).toBeLessThanOrEqual(1);
    expect(box!.y + box!.height).toBe(viewport.height);

    await page.locator('input[type="file"]').setInputFiles({ name: "slip.png", mimeType: "image/png", buffer: SLIP_PNG });
    await page.getByRole("button", { name: T.booking.submitBooking }).click();

    await expect(overlay(page).getByText(T.booking.confirmedTitle)).toBeVisible();
    await overlay(page).getByRole("button", { name: T.booking.backToHomestay }).click();
    await expect(page.locator('[data-checkout="closed"]')).toBeAttached();
  });

  test("asks before leaving on Back, over the overlay, and staying keeps the checkout open", async ({ page, context }) => {
    const slug = requireSlug();
    await open(page, context, "normal");
    await reachPayment(page, slug);

    await page.goBack();
    const leave = page.getByRole("dialog").filter({ hasText: T.booking.leaveTitle });
    await expect(leave).toBeVisible();
    await expectAbove(leave, page);
    await leave.getByRole("button", { name: T.booking.leaveStay }).click();

    await expect(leave).toBeHidden();
    await expect(overlay(page)).toBeVisible();
    await expect(page.getByRole("button", { name: T.booking.submitBooking })).toBeVisible();
  });
});
