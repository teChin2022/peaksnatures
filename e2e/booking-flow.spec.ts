import { expect, test, type Locator, type Page } from "@playwright/test";
import {
  CREATED_ID,
  T,
  addHouses,
  bookingPosts,
  chooseDates,
  expectNoUnexpectedWrites,
  reachPayment,
  reachReview,
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
  options: { holdMs?: number; turnstile?: "pass" | "blocked"; cancellationDays?: number } = {},
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

  test("books several houses in one booking, through the group route", async ({ page, context }) => {
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

test.describe("Thai typography", () => {
  test("letter-spaces no Thai text, only Latin marked lang=en", async ({ page, context }) => {
    const slug = requireSlug();
    await open(page, context, "normal");
    await page.goto(`/${slug}`);
    await page.waitForLoadState("networkidle");

    const spacing = await page.evaluate(() => {
      const tracked = [...document.querySelectorAll<HTMLElement>('[class*="tracking-wide"], [class*="tracking-[0."]')];
      const of = (el: HTMLElement) => getComputedStyle(el).letterSpacing;
      return {
        thai: tracked.filter((el) => el.closest("[lang]")?.getAttribute("lang") === "th").map(of),
        latin: tracked.filter((el) => el.closest("[lang]")?.getAttribute("lang") === "en").map(of),
      };
    });
    expect(spacing.thai.length).toBeGreaterThan(0);
    expect(spacing.thai.every((s) => s === "normal")).toBe(true);
    // The house numerals ("01", "02") keep their tracking.
    expect(spacing.latin.length).toBeGreaterThan(0);
    expect(spacing.latin.some((s) => s !== "normal")).toBe(true);
  });

  // Geist was loaded for months without ever reaching the body: the font has to be applied, not just declared.
  test("sets the text and the buttons in Anuphan, downloaded with the page, not the phone's own font", async ({ page, context }) => {
    const slug = requireSlug();
    await open(page, context, "normal");
    await page.goto(`/${slug}`);
    await page.waitForLoadState("networkidle");

    const font = await page.evaluate(async () => {
      await document.fonts.ready;
      const loaded: string[] = [];
      document.fonts.forEach((face) => {
        if (face.status === "loaded") loaded.push(face.family);
      });
      return {
        body: getComputedStyle(document.body).fontFamily,
        button: getComputedStyle(document.querySelector("button")!).fontFamily,
        loaded,
      };
    });
    expect(font.body).toContain("Anuphan");
    expect(font.button).toContain("Anuphan");
    expect(font.loaded.some((family) => family.includes("Anuphan"))).toBe(true);
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

test.describe("booking from the availability calendar", () => {
  /** Opens a day some way ahead that still has a house free. */
  async function openFreeDay(page: Page, slug: string) {
    await page.goto(`/${slug}/book`);
    const section = page.locator("section").filter({ has: page.getByRole("heading", { name: T.availability.title }) });
    // Every day ahead carries a status label once the client-only grid renders.
    await expect(section.getByRole("button", { name: / — / }).first()).toBeVisible();
    const free = section.getByRole("button", { name: new RegExp(` — (${T.availability.legendAvailable}|${T.availability.legendPartial})$`) });
    // A month can be fully booked, or nearly over: look up to three months ahead.
    for (let month = 0; month < 3 && (await free.count()) === 0; month += 1) {
      await section.getByRole("button", { name: "Go to the Next Month" }).click();
    }
    test.skip((await free.count()) === 0, "no free house in the next three months");
    await free.nth(Math.min(4, (await free.count()) - 1)).click();
  }

  /** Picks the check-out in the day dialog's picker view; the house list narrows to the house, whose config dialog opens to choose it. */
  async function pickCheckOutAndAdd(page: Page, house: string) {
    // Still the one day dialog: the picker replaced its body instead of opening on top.
    await expect(page.getByRole("dialog")).toHaveCount(1);
    const picker = page.getByRole("dialog");
    await expect(picker.getByRole("heading", { name: T.booking.selectDates })).toBeVisible();
    // The tapped day is already the check-in: only the check-out is left to pick.
    const pickerDays = picker.locator("button[data-day]");
    await expect(picker.locator('button[data-selected-single="true"]')).toHaveCount(1);
    // The month sits centred in the dialog. On a 375px phone Saturday used to touch its right
    // edge (2px) while Sunday sat 32px from the left. Gaps, not the padding: the seven 44px days
    // fill the phone's content box to the subpixel. Measured once the open animation is over.
    const [leftGap, rightGap] = await picker.evaluate(async (el) => {
      await Promise.all(el.getAnimations().map((a) => a.finished));
      const box = el.getBoundingClientRect();
      const days = [...el.querySelectorAll("button[data-day]")].map((d) => d.getBoundingClientRect());
      return [Math.min(...days.map((d) => d.left)) - box.left, box.right - Math.max(...days.map((d) => d.right))];
    });
    expect(Math.abs(leftGap - rightGap)).toBeLessThanOrEqual(4);
    const startIndex = await pickerDays.evaluateAll((els) => els.findIndex((el) => el.getAttribute("data-selected-single") === "true"));
    await pickerDays.nth(startIndex + 1).click();
    await picker.getByRole("button", { name: T.common.done }).click();

    const config = page.getByRole("dialog").filter({ has: page.getByRole("button", { name: T.booking.chooseAnotherHouse }) });
    await expect(config.getByRole("heading", { name: house })).toBeVisible();
    // Behind it, the house list shows this house only (owner, 2026-11-15).
    const cards = page.locator("#rooms-section [data-room-id]");
    await expect(cards).toHaveCount(1);
    await expect(cards.first()).toContainText(house);
    const add = config.getByRole("button", { name: T.booking.chooseAnotherHouse });
    // A house priced by guest group cannot be chosen until one group is.
    if (await add.isDisabled()) await config.getByRole("button", { name: /฿/ }).first().click();
    await add.click();

    await expect(page.getByText(T.booking.addedToast.replace("{name}", house))).toBeVisible();
    await expect(page.getByRole("dialog")).toBeHidden();
  }

  test("hands the house picked on a day straight to its config dialog, without choosing it again", async ({ page, context }) => {
    const slug = requireSlug();
    await open(page, context, "normal");
    await openFreeDay(page, slug);

    await page.getByRole("dialog").getByRole("button", { name: T.availability.viewDetails }).first().click();
    const house = (await page.getByRole("dialog").getByRole("heading").first().textContent())!.trim();
    await page.getByRole("dialog").getByRole("button", { name: T.availability.bookThisHouse }).click();

    await pickCheckOutAndAdd(page, house);
  });

  test("books a house straight from the day's list, skipping its details", async ({ page, context }) => {
    const slug = requireSlug();
    await open(page, context, "normal");
    await openFreeDay(page, slug);

    const row = page.getByRole("dialog").getByRole("listitem").filter({ has: page.getByRole("button", { name: T.availability.bookThisHouse }) }).first();
    const house = (await row.locator("p").first().textContent())!.trim();
    await row.getByRole("button", { name: T.availability.bookThisHouse }).click();

    await pickCheckOutAndAdd(page, house);
  });

  test("a house's details keep Book and close on screen, and many photos stay inside the dialog", async ({ page, context }) => {
    const slug = requireSlug();
    await open(page, context, "normal");
    await openFreeDay(page, slug);

    const dialog = page.getByRole("dialog");
    const details = dialog.getByRole("button", { name: T.availability.viewDetails }).first();
    await details.click();
    const book = dialog.getByRole("button", { name: T.availability.bookThisHouse });
    // Focus follows the view: the house name, then back to the row it came from.
    await expect(dialog.getByRole("heading").first()).toBeFocused();
    await expect(book).toBeInViewport();

    // The body scrolls between a header and a footer that stay put: at the
    // rate table (the end of the body) Book, Back and close are all still there.
    await dialog.getByText(T.rooms.priceDetailsTitle).scrollIntoViewIfNeeded();
    await expect(book).toBeInViewport();
    await expect(dialog.getByRole("button", { name: T.common.back })).toBeInViewport();
    await expect(dialog.getByRole("button", { name: "Close" })).toBeInViewport();

    // A house with 12 photos (2026-11-15: 8 pushed the photo past the dialog's
    // right edge and the dialog scrolled sideways). The test houses have fewer,
    // so the thumbnail row is padded in place.
    const measured = await dialog.evaluate(async (el) => {
      await Promise.all(el.getAnimations().map((a) => a.finished));
      const thumb = el.querySelector("button[aria-current]");
      if (!thumb) return null;
      while (thumb.parentElement!.children.length < 12) thumb.parentElement!.append(thumb.cloneNode(true));
      const box = el.getBoundingClientRect();
      const photo = el.querySelector('[style*="pan-y"]')!.getBoundingClientRect();
      // Any scroll container but the thumbnail row itself, which is meant to scroll sideways.
      const sideways = [el, ...el.querySelectorAll("*")].some(
        (n) => n !== thumb.parentElement && ["auto", "scroll"].includes(getComputedStyle(n).overflowX) && n.scrollWidth > n.clientWidth,
      );
      return { left: photo.left - box.left, right: box.right - photo.right, sideways };
    });
    test.skip(!measured, "the first free house has a single photo, so no thumbnail row");
    expect(Math.abs(measured!.left - measured!.right)).toBeLessThanOrEqual(1);
    expect(measured!.sideways).toBe(false);

    await dialog.getByRole("button", { name: T.common.back }).click();
    await expect(details).toBeFocused();
  });

  test("leaving the check-out picker without Done leaves no half-picked dates behind", async ({ page, context }) => {
    const slug = requireSlug();
    await open(page, context, "normal");
    await openFreeDay(page, slug);

    const dialog = page.getByRole("dialog");
    await dialog.getByRole("button", { name: T.availability.bookThisHouse }).first().click();
    await expect(dialog.getByRole("heading", { name: T.booking.selectDates })).toBeVisible();
    await dialog.getByRole("button", { name: T.common.back }).click();
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();

    // The page's own date picker shows no check-in: the tapped day was not kept.
    await page.getByRole("button", { name: T.booking.selectDates }).last().click();
    const checkIn = page.getByRole("dialog").locator("div.rounded-xl", { hasText: T.booking.checkInLabel });
    await expect(checkIn).toContainText(T.booking.addDate);
  });

  test("fits a 320px phone: the month grid and the check-out picker", async ({ page, context }, testInfo) => {
    test.skip(testInfo.project.name !== "phone", "phone layout only");
    const slug = requireSlug();
    await open(page, context, "normal");
    await page.setViewportSize({ width: 320, height: 640 });
    await openFreeDay(page, slug);

    // Seven days inside the box that holds them, with even gaps either side,
    // measured once a dialog's open animation (a scale) is over.
    const fits = (box: Locator, days: string) =>
      box.evaluate(async (el, sel) => {
        await Promise.all(el.getAnimations().map((a) => a.finished));
        const r = el.getBoundingClientRect();
        const d = [...el.querySelectorAll(sel)].map((b) => b.getBoundingClientRect());
        const left = Math.min(...d.map((x) => x.left)) - r.left;
        const right = r.right - Math.max(...d.map((x) => x.right));
        return { left, right };
      }, days);

    await page.keyboard.press("Escape");
    const grid = page.locator("section").filter({ has: page.getByRole("heading", { name: T.availability.title }) }).locator("div.rounded-2xl").first();
    const gridGaps = await fits(grid, 'button[aria-label*=" — "]');
    expect(gridGaps.right).toBeGreaterThanOrEqual(0);
    expect(Math.abs(gridGaps.left - gridGaps.right)).toBeLessThanOrEqual(4);

    await openFreeDay(page, slug);
    await page.getByRole("dialog").getByRole("button", { name: T.availability.bookThisHouse }).first().click();
    const pickerGaps = await fits(page.getByRole("dialog"), "button[data-day]");
    expect(pickerGaps.right).toBeGreaterThanOrEqual(0);
    expect(Math.abs(pickerGaps.left - pickerGaps.right)).toBeLessThanOrEqual(4);
  });
});

test.describe("a house card's photos", () => {
  test("are named in Thai, and their thumbnails are a 44px touch target", async ({ page, context }) => {
    const slug = requireSlug();
    await open(page, context, "normal");
    await page.goto(`/${slug}/book`);
    const card = page.locator("#rooms-section [data-room-id]").first();
    await card.scrollIntoViewIfNeeded();
    const name = (await card.getByRole("heading").first().textContent())!.trim();
    const alt = T.gallery.photoAlt.replace("{name}", name).replace("{number}", "1");
    await expect(card.getByRole("img", { name: alt, exact: true })).toBeAttached();
    await expect(card.getByRole("button", { name: T.gallery.showAll, exact: true })).toBeAttached();

    const thumbs = card.locator("button[aria-current]");
    test.skip((await thumbs.count()) === 0, "the first house has a single photo");
    const heights = await thumbs.evaluateAll((els) => els.map((el) => el.getBoundingClientRect().height));
    expect(Math.min(...heights)).toBeGreaterThanOrEqual(44);
  });
});

test.describe("toasts", () => {
  test("a success toast's text passes AA (4.5:1) on its own tint", async ({ page, context }) => {
    const slug = requireSlug();
    await open(page, context, "normal");
    await page.goto(`/${slug}/book`);
    await chooseDates(page);
    await addHouses(page, 1);
    const toast = page.locator('[data-sonner-toast][data-type="success"]').first();
    await expect(toast).toBeVisible();
    const ratio = await toast.evaluate((el) => {
      const rgb = (c: string) => c.match(/[\d.]+/g)!.slice(0, 3).map(Number);
      const lum = (c: string) => {
        const [r, g, b] = rgb(c).map((v) => v / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
        return 0.2126 * r + 0.7152 * g + 0.0722 * b;
      };
      const s = getComputedStyle(el);
      const [a, b] = [lum(s.color), lum(s.backgroundColor)].sort((x, y) => y - x);
      return (a + 0.05) / (b + 0.05);
    });
    expect(ratio).toBeGreaterThanOrEqual(4.5);
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

test.describe("the availability calendar once the stay is chosen", () => {
  test("folds away so the houses come first, and opens on the stay with its days marked", async ({ page, context }) => {
    const slug = requireSlug();
    await open(page, context, "normal");
    await page.goto(`/${slug}/book`);
    const section = page.locator("section").filter({ has: page.getByRole("heading", { name: T.availability.title }) });
    const grid = section.getByRole("button", { name: / — / });
    await expect(grid.first()).toBeVisible();

    await chooseDates(page);
    const toggle = section.getByRole("button", { name: T.availability.showCalendar });
    await expect(toggle).toHaveAttribute("aria-expanded", "false");
    await expect(grid).toHaveCount(0);
    // Folded to one row: the houses start right under its heading.
    const gap = await page.locator("#rooms-section").evaluate((rooms, head) => {
      const h = [...document.querySelectorAll("h2")].find((e) => e.textContent === head)!;
      return rooms.getBoundingClientRect().top - h.getBoundingClientRect().bottom;
    }, T.availability.title);
    expect(gap).toBeLessThan(160);

    await toggle.click();
    await expect(section.getByRole("button", { name: T.availability.hideCalendar })).toHaveAttribute("aria-expanded", "true");
    // chooseDates picks one night: check-in and check-out are marked.
    await expect(section.getByRole("button", { name: new RegExp(`, ${T.availability.legendStay} — `) })).toHaveCount(2);
    await expect(section.getByText(T.availability.legendStay, { exact: true })).toBeVisible();
  });
});

test.describe("before paying: can the guest cancel, and how to reach the host", () => {
  const cases: [string, number, RegExp][] = [
    ["no online cancellation (0 days)", 0, new RegExp(`^${T.booking.cancellationNone}$`)],
    ["the free window still open", 1, new RegExp(`^${T.booking.freeCancellationUntil.replace("{date}", ".+")}$`)],
    ["the free window already passed", 3650, new RegExp(`^${T.booking.cancellationPassed.replace("{days}", "3650").replace(/[()]/g, "\\$&")}$`)],
  ];
  for (const [name, days, line] of cases) {
    test(`the review step always has a cancellation line: ${name}`, async ({ page, context }) => {
      const slug = requireSlug();
      await open(page, context, "normal", { cancellationDays: days });
      await reachReview(page, slug);
      const review = page.locator('[data-checkout="open"]');
      await expect(review.getByText(line)).toBeVisible();
    });
  }

  // Needs an E2E_SLUG host with a phone or a Facebook page: without either the line is left out on purpose.
  test("the payment step offers the host's contact under the do-not-close note", async ({ page, context }) => {
    const slug = requireSlug();
    await open(page, context, "normal");
    await reachPayment(page, slug);
    const contact = page.locator('[data-checkout="open"] p').filter({ hasText: T.booking.hostContactQuestion });
    await expect(contact).toBeVisible();
    await expect(contact.getByRole("link").first()).toHaveAttribute("href", /^(tel:|https:\/\/(m\.me|www\.facebook\.com)\/)/);
  });
});

test.describe("a house's config dialog", () => {
  test("opens ready to book: Book Now is on at once, with the normal-price group chosen when the house has groups", async ({ page, context }) => {
    const slug = requireSlug();
    await open(page, context, "normal");
    await page.goto(`/${slug}/book`);
    await chooseDates(page);
    await page.getByRole("button", { name: T.rooms.selectThisRoom, disabled: false }).first().click();
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByRole("button", { name: new RegExp(`^${T.common.bookNow}`) })).toBeEnabled();
    const groups = dialog.locator("button[aria-pressed]");
    if ((await groups.count()) > 0) await expect(dialog.locator('button[aria-pressed="true"]')).toHaveCount(1);
  });
});

test.describe("prices and a refresh on the house list", () => {
  test("with a stay chosen, a card prices the whole stay, the same total its dialog opens on", async ({ page, context }) => {
    const slug = requireSlug();
    await open(page, context, "normal");
    await page.goto(`/${slug}/book`);
    await chooseDates(page);
    const card = page.locator("#rooms-section [data-room-id]").filter({ has: page.getByRole("button", { name: T.rooms.selectThisRoom, disabled: false }) }).first();
    const nights = new RegExp(T.rooms.stayPriceNights.replace("{count}", "\\d+"));
    const price = card.locator("p").filter({ hasText: nights });
    await expect(price).toBeVisible();
    const total = (await price.textContent())!.match(/฿[\d,]+/)![0];

    await card.getByRole("button", { name: T.rooms.selectThisRoom }).click();
    // The normal-price group is chosen for the guest, so the dialog opens on the same total.
    await expect(page.getByRole("dialog")).toContainText(total);
  });

  test("each house shows tonight's price the same way on the homestay page and on /book, labelled ราคา", async ({ page, context }) => {
    const slug = requireSlug();
    await open(page, context, "normal");
    // Name → the price line as read ("ราคา฿1,500/คืน"), from each page's house cards.
    const prices = (cards: string) =>
      page.locator(cards).evaluateAll((els) =>
        els.map((el) => {
          const price = [...el.querySelectorAll("p")].map((p) => p.textContent ?? "").find((t) => t.includes("฿")) ?? "";
          return [el.querySelector("h3")?.textContent ?? "", price.replace(/\s+/g, "")] as const;
        }),
      );
    await page.goto(`/${slug}`);
    // On the homestay page the label sits on its own line above the figure.
    const landing = await page.locator("#rooms article").evaluateAll((els) =>
      els.map((el) => [el.querySelector("h3")?.textContent ?? "", (el.querySelector(".border-t")?.textContent ?? "").replace(/\s+/g, "")] as const),
    );
    await page.goto(`/${slug}/book`);
    const book = await prices("#rooms-section [data-room-id]");
    expect(book.length).toBeGreaterThan(0);
    for (const [name, price] of book) {
      // Tonight's price, never a "from" floor (owner, 2026-11-18).
      expect(price.startsWith(T.rooms.priceTonight + "฿"), `${name}: "${price}"`).toBe(true);
      const onLanding = landing.find(([n]) => n === name);
      expect(onLanding, `${name} is on the homestay page`).toBeDefined();
      // The landing line also holds the "check availability" link; the price comes first.
      expect(onLanding![1].startsWith(price), `${name}: "${onLanding![1]}" starts with "${price}"`).toBe(true);
    }
  });

  test("the homestay page's structured data quotes the prices its cards show", async ({ page, context }) => {
    const slug = requireSlug();
    await open(page, context, "normal");
    await page.goto(`/${slug}`);
    const ld = JSON.parse((await page.locator("script#ld-lodging").textContent())!) as {
      priceRange?: string;
      makesOffer?: { name: string; price: number }[];
    };
    const digits = (t: string) => Number(t.replace(/[^\d]/g, ""));
    // Name → the card's figure (the first ฿ amount on its price line).
    const cards = await page.locator("#rooms article").evaluateAll((els) =>
      els.map((el) => [el.querySelector("h3")?.textContent ?? "", (el.querySelector(".border-t")?.textContent ?? "").match(/฿[\d,]+/)?.[0] ?? ""] as const),
    );
    expect(ld.makesOffer?.length).toBeGreaterThan(0);
    for (const offer of ld.makesOffer!) {
      const card = cards.find(([name]) => name === offer.name);
      expect(card, `${offer.name} has a card`).toBeDefined();
      expect(offer.price, offer.name).toBe(digits(card![1]));
    }
    expect(digits(ld.priceRange!)).toBe(Math.min(...ld.makesOffer!.map((o) => o.price)));
  });

  test("a reload keeps the stay and the chosen house", async ({ page, context }) => {
    const slug = requireSlug();
    await open(page, context, "normal");
    await page.goto(`/${slug}/book`);
    await chooseDates(page);
    await addHouses(page, 1);
    const chosen = page.locator("#rooms-section [data-room-id]").getByText(T.rooms.chosen, { exact: true });
    await expect(chosen.first()).toBeVisible();

    await page.reload();
    await expect(chosen.first()).toBeVisible();
    // The houses heading names the stay (and offers to change it) only for a full stay.
    await expect(page.locator("#rooms-section").getByRole("button", { name: T.booking.changeDates, exact: true })).toBeVisible();
  });
});

test.describe("booking without a cart", () => {
  test("one house: the list starts at it, its Book Now opens the guest details, and Back returns to it, still chosen", async ({ page, context }) => {
    const slug = requireSlug();
    await open(page, context, "normal");
    await page.goto(`/${slug}/book`);
    await chooseDates(page);
    // After the date picker's Done the list starts with one house.
    await expect(page.locator("#rooms-section [data-room-id]")).toHaveCount(1);

    await addHouses(page, 1, { book: true });
    const overlay = page.locator('[data-checkout="open"]');
    await expect(page.locator("#bk-name")).toBeVisible();
    await expect(overlay.getByRole("button", { name: T.bookingTutorial.reopen })).toBeVisible();

    await overlay.getByRole("button", { name: T.common.back }).click();
    await expect(page.locator('[data-checkout="closed"]')).toBeAttached();
    await expect(page.locator("#rooms-heading")).toBeFocused();
    await expect(page.locator("#rooms-section [data-room-id]").getByText(T.rooms.chosen, { exact: true }).first()).toBeVisible();
  });

  test("several houses: choosing another shows the rest, and the bottom bar's Book Now takes them all to the guest details", async ({ page, context }) => {
    const slug = requireSlug();
    await open(page, context, "normal");
    await page.goto(`/${slug}/book`);
    await chooseDates(page);
    await addHouses(page, 2);
    // One chosen line (with its edit control) per house.
    await expect(page.locator("#rooms-section [data-room-id]").getByRole("button", { name: T.common.edit, exact: true })).toHaveCount(2);

    // The phone bar or the desktop dock (one per width); it hides while the date panel is on screen.
    await page.locator("#rooms-section [data-room-id]").first().scrollIntoViewIfNeeded();
    await page.locator("[data-bottom-bar]").getByRole("button", { name: T.common.bookNow, exact: true }).click();
    await expect(page.locator("#bk-name")).toBeVisible();
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

  test("Back inside the checkout goes one step back at a time, from the review to the details to the houses", async ({ page, context }) => {
    const slug = requireSlug();
    await open(page, context, "normal");
    await reachReview(page, slug);
    const leave = page.getByRole("dialog").filter({ hasText: T.booking.leaveTitle });

    await page.goBack();
    await leave.getByRole("button", { name: T.booking.leaveBackToDetails }).click();
    await expect(leave).toBeHidden();
    await expect(page.locator("#bk-name")).toBeVisible();

    // The guard is armed again: the next Back asks again, one more step back.
    await page.goBack();
    await leave.getByRole("button", { name: T.booking.leaveBackToHouses }).click();
    await expect(page.locator('[data-checkout="closed"]')).toBeAttached();
    await expect(page.locator("#rooms-section [data-room-id]").getByText(T.rooms.chosen, { exact: true }).first()).toBeVisible();
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

test.describe("the guest AI assistant", () => {
  // A Bangkok day `days` ahead, as the route would send it.
  const dayAhead = (days: number) => new Date(Date.now() + 7 * 3_600_000 + days * 86_400_000).toISOString().slice(0, 10);

  test("asking sets the stay on the page, says what is free, and leads to the houses", async ({ page, context }, testInfo) => {
    const slug = requireSlug();
    const checkIn = dayAhead(60);
    const checkOut = dayAhead(61);
    // guestAi: the page shows the assistant without a host row (rewritten in its payload).
    session = await startSession(page, context, { mode: "normal", guestAi: true });
    session.respond("POST /api/guest-ai", {
      body: {
        reply: "ได้เลยค่ะ",
        answered: true,
        intent: { check_in: checkIn, check_out: checkOut, guests: 2, room_ids: [] },
        action: null,
      },
    });
    const G = T.guestAiAsk;
    await page.goto(`/${slug}/book`);

    // Phones: the link under the date panel. Desktop: the button in the corner. Same name.
    // Waited for: the corner button renders after hydration.
    const entry = page.getByRole("button", { name: G.title }).filter({ visible: true }).first();
    await expect(entry).toBeVisible({ timeout: 20_000 });
    await entry.click();
    const ask = page.getByLabel(G.inputLabel);
    // Focused on desktop; on phones the keyboard waits for a tap (critique 2026-11-19).
    if (testInfo.project.name === "desktop") await expect(ask).toBeFocused();
    else await expect(ask).not.toBeFocused();
    await ask.fill("เสาร์อาทิตย์หน้า 2 คน");
    await ask.press("Enter");

    // "เลือกวันให้แล้ว: {from} – {to} · {nights} คืน", worked out by the page from its own cart.
    const datesLine = page.getByText(G.datesSet.split("{")[0]);
    await expect(datesLine).toBeVisible();
    await expect(page.getByText(G.source)).toBeVisible();
    const call = session.calls.find((c) => c.path === "/api/guest-ai");
    expect(call?.body).toMatchObject({ slug, question: "เสาร์อาทิตย์หน้า 2 คน", locale: "th", history: [] });
    // The first question carries Turnstile's token: no session yet.
    expect((call?.body as { turnstileToken?: string }).turnstileToken).toBeTruthy();
    await page.screenshot({ path: testInfo.outputPath("guest-ai-answer.png") });

    // The page's own date panel now holds the stay (as text: on phones the sheet hides the page from the a11y tree).
    await expect(page.locator("#date-panel")).toContainText(String(Number(checkIn.slice(8))));

    // The assistant's own button, not the date panel's one of the same name.
    await page.locator('aside, [role="dialog"]').getByRole("button", { name: G.seeHouses }).click();
    await expect(page.locator("#rooms-section [data-room-id]").first()).toBeInViewport();
  });

  for (const mode of ["normal", "quick"] as const) {
    test(`a suggested house goes through the page's own house dialog to the guest details (${mode} host)`, async ({ page, context }, testInfo) => {
      const slug = requireSlug();
      session = await startSession(page, context, { mode, guestAi: true });
      const G = T.guestAiAsk;
      await page.goto(`/${slug}/book`);
      // Suggest every house: the assistant lists the ones free for the stay (at most two).
      const roomIds = await page.locator("#rooms-section [data-room-id]").evaluateAll((els) => els.map((el) => el.getAttribute("data-room-id")));
      session.respond("POST /api/guest-ai", {
        body: {
          reply: "แนะนำบ้านพักที่ว่างให้แล้วค่ะ",
          answered: true,
          intent: { check_in: dayAhead(75), check_out: dayAhead(76), guests: 2, room_ids: roomIds },
          action: null,
        },
      });

      const entry = page.getByRole("button", { name: G.title }).filter({ visible: true }).first();
      await expect(entry).toBeVisible({ timeout: 20_000 });
      await entry.click();
      await page.getByLabel(G.inputLabel).fill("อยากพักหลังที่เหมาะกับ 2 คน");
      await page.getByLabel(G.inputLabel).press("Enter");
      // With a priced card the source line drops "prices on the cards": its first part is in both.
      await expect(page.getByText(G.sourceDates)).toBeVisible();

      const suggestions = page.getByRole("list", { name: G.suggestTitle });
      test.skip((await suggestions.count()) === 0, "needs a house free 75 days ahead");
      await page.screenshot({ path: testInfo.outputPath(`suggested-${mode}.png`) });
      await suggestions.getByRole("button", { name: new RegExp(`^${G.chooseHouseAria.split("{")[0]}`) }).first().click();

      // The page's own config dialog, then its "Book now", as from a house card.
      const dialog = page.getByRole("dialog");
      await expect(dialog).toBeVisible();
      await dialog.getByRole("button", { name: new RegExp(`^${T.common.bookNow}`) }).click();
      await expect(page.locator('[data-checkout="open"]')).toBeVisible();
      // Nothing was booked or held: the guest is at the details step.
      expect(session.calls.filter((c) => c.method === "POST" && c.path !== "/api/guest-ai")).toEqual([]);
    });
  }
});
