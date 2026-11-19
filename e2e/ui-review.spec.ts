import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test, type Page, type TestInfo } from "@playwright/test";
import { CHANGE_PREVIEW_SAME_PRICE, T, addHouses, chooseDates, chooseNewStay, expectNoUnexpectedWrites, fillGuestLookup, findBooking, reachPayment, requireSlug, startSession, stubChangeBooking, stubbedBooking, type Session } from "./support";

/**
 * Evidence for a UI review (peaksnature-ui Mode A), not a regression test.
 *
 *   UI_REVIEW=1 E2E_SLUG=<slug> npx playwright test ui-review
 *
 * For each state it saves a full-page screenshot and runs Impeccable's
 * detector against the same live page over CDP, so contrast and tiny-text are
 * read from the real render at the real width. Output goes to
 * .impeccable/review/ui-review-<stamp>/ (gitignored). The page is guarded by
 * startSession like the booking specs: nothing is written to the database.
 * Findings never fail the run; an unstubbed write does.
 */

test.skip(!process.env.UI_REVIEW, "Set UI_REVIEW=1 to capture UI review evidence.");

const DETECT = ".claude/skills/impeccable/scripts/impeccable";
const PORTS: Record<string, number> = { phone: 9333, desktop: 9334 };
const OUT = join(".impeccable", "review", `ui-review-${process.env.UI_REVIEW_STAMP ?? new Date().toISOString().slice(0, 16).replace(/[:T]/g, "-")}`);

// The detector attaches to this browser's DevTools port while the test still
// holds the viewport emulation (it is dropped when the CDP client disconnects).
test.use({
  launchOptions: [
    async ({}, use, workerInfo) => {
      // Keeps the config's flag: without it a page startSession rewrites never hydrates under `next dev`.
      await use({ args: ["--disable-features=LocalNetworkAccessChecks", `--remote-debugging-port=${PORTS[workerInfo.project.name] ?? 9335}`] });
    },
    { scope: "worker" },
  ],
});

let session: Session;

test.afterEach(() => {
  if (session) expectNoUnexpectedWrites(session);
});

/** Scrolls through the page so `whileInView` sections render before the capture. */
async function revealAll(page: Page) {
  await page.evaluate(async () => {
    for (let y = 0; y < document.body.scrollHeight; y += window.innerHeight / 2) {
      window.scrollTo(0, y);
      await new Promise((r) => setTimeout(r, 150));
    }
    window.scrollTo(0, 0);
  });
  await page.waitForTimeout(800);
}

async function capture(page: Page, testInfo: TestInfo, state: string, slug: string) {
  const width = page.viewportSize()?.width ?? 0;
  const name = `${state}-${width}`;
  mkdirSync(OUT, { recursive: true });
  // Hide the Next dev overlay: it sits on the header's menu button.
  await page.addStyleTag({ content: "nextjs-portal{display:none!important}" });
  await page.screenshot({ path: join(OUT, `${name}.png`), fullPage: true });

  if (!existsSync(DETECT)) {
    writeFileSync(join(OUT, `${name}.detect.json`), JSON.stringify({ error: "detector not installed" }));
    return;
  }
  const port = String(PORTS[testInfo.project.name] ?? 9335);
  let out: string;
  try {
    out = execFileSync(DETECT, ["detect", "--cdp", port, "--target", slug, "--json"], { encoding: "utf8" });
  } catch (error) {
    // Exit 2 means the scan finished with findings; anything else is a failed scan.
    const e = error as { status?: number; stdout?: string; stderr?: string };
    out = e.status === 2 && e.stdout ? e.stdout : JSON.stringify({ error: `detect exit ${e.status}`, stderr: e.stderr });
  }
  writeFileSync(join(OUT, `${name}.detect.json`), out);
}

/** The desktop project also covers the tablet width; the phone project keeps its touch emulation. */
const widthsFor = (testInfo: TestInfo) => (testInfo.project.name === "desktop" ? [1280, 768] : [null]);

test("landing page", async ({ page, context }, testInfo) => {
  const slug = requireSlug();
  session = await startSession(page, context);
  for (const width of widthsFor(testInfo)) {
    if (width) await page.setViewportSize({ width, height: 800 });
    await page.goto(`/${slug}`);
    await revealAll(page);
    await capture(page, testInfo, "landing", slug);
  }
});

test("platform home", async ({ page, context }, testInfo) => {
  session = await startSession(page, context);
  for (const width of widthsFor(testInfo)) {
    if (width) await page.setViewportSize({ width, height: 800 });
    // The query string gives `detect --target` a URL part only this tab has.
    await page.goto("/?ui-review=home");
    await revealAll(page);
    await capture(page, testInfo, "home", "ui-review=home");
  }
});

test("platform home, search", async ({ page, context }, testInfo) => {
  session = await startSession(page, context);
  for (const width of widthsFor(testInfo)) {
    if (width) await page.setViewportSize({ width, height: 800 });
    await page.goto("/?ui-review=home-search");
    await page.waitForTimeout(1200); // let the hero entrance (300ms delay + 700ms) finish
    // Keyboard path: the focus ring on the box is part of what this state shows.
    await page.locator("#landing-search").focus();
    await page.keyboard.type("ไม่มีที่นี่");
    await page.screenshot({ path: join(OUT, `home-search-focus-${page.viewportSize()?.width}.png`) });
    await page.keyboard.press("Enter");
    await page.waitForTimeout(800);
    await capture(page, testInfo, "home-search-empty", "ui-review=home-search");
  }
});

test("booking page, first view", async ({ page, context }, testInfo) => {
  const slug = requireSlug();
  session = await startSession(page, context);
  for (const width of widthsFor(testInfo)) {
    if (width) await page.setViewportSize({ width, height: 800 });
    await page.goto(`/${slug}/book`);
    await page.waitForLoadState("networkidle");
    await capture(page, testInfo, "book", slug);
  }
});

test("booking page, a house chosen", async ({ page, context }, testInfo) => {
  const slug = requireSlug();
  session = await startSession(page, context);
  for (const width of widthsFor(testInfo)) {
    if (width) await page.setViewportSize({ width, height: 800 });
    await page.goto(`/${slug}/book`);
    await chooseDates(page);
    await addHouses(page, 1);
    // The viewport, not the full page: the chosen card and the bottom bar (or dock) together.
    await page.locator("#rooms-section [data-room-id]").first().scrollIntoViewIfNeeded();
    await page.waitForTimeout(600);
    await page.addStyleTag({ content: "nextjs-portal{display:none!important}" });
    await page.screenshot({ path: join(OUT, `book-chosen-view-${page.viewportSize()?.width}.png`) });
    await capture(page, testInfo, "book-chosen", slug);
  }
});

test("booking page, guest AI assistant", async ({ page, context }, testInfo) => {
  const slug = requireSlug();
  // Shown without a host row (startSession rewrites guestAiEnabled); the answer is a stub.
  session = await startSession(page, context, { guestAi: true });
  const day = (n: number) => new Date(Date.now() + 7 * 3_600_000 + n * 86_400_000).toISOString().slice(0, 10);
  session.respond("POST /api/guest-ai", {
    body: {
      reply: "เลือกวันให้ตามที่ถามแล้วค่ะ ราคาดูบนการ์ดบ้านพักได้เลย",
      answered: true,
      intent: { check_in: day(60), check_out: day(62), guests: 4, room_ids: [] },
      action: null,
    },
  });
  for (const width of widthsFor(testInfo)) {
    if (width) await page.setViewportSize({ width, height: 800 });
    await page.goto(`/${slug}/book`);
    // The corner button renders after hydration: wait for it.
    const entry = page.getByRole("button", { name: T.guestAiAsk.title }).filter({ visible: true }).first();
    await expect(entry).toBeVisible({ timeout: 20_000 });
    // The way in before anything is asked: the link under the dates (phones) or the corner button.
    await page.addStyleTag({ content: "nextjs-portal{display:none!important}" });
    await page.screenshot({ path: join(OUT, `ai-assist-entry-${page.viewportSize()?.width}.png`) });
    await entry.click();
    await page.waitForTimeout(400); // sheet / panel entrance
    await page.screenshot({ path: join(OUT, `ai-assist-empty-${page.viewportSize()?.width}.png`) });
    const ask = page.getByLabel(T.guestAiAsk.inputLabel);
    await ask.fill("เสาร์อาทิตย์หน้า 4 คน");
    await ask.press("Enter");
    await expect(page.getByText(T.guestAiAsk.source)).toBeVisible();
    await page.waitForTimeout(300);
    await page.screenshot({ path: join(OUT, `ai-assist-answer-${page.viewportSize()?.width}.png`) });
    await capture(page, testInfo, "ai-assist", slug);
  }
});

test("booking page, availability day", async ({ page, context }, testInfo) => {
  const slug = requireSlug();
  session = await startSession(page, context);
  for (const width of widthsFor(testInfo)) {
    if (width) await page.setViewportSize({ width, height: 800 });
    await page.goto(`/${slug}/book`);
    const section = page.locator("section").filter({ has: page.getByRole("heading", { name: T.availability.title }) });
    await expect(section.getByRole("button", { name: / — / }).first()).toBeVisible();
    // A partly booked day shows both row kinds; fall back to any day with a house free.
    const partial = section.getByRole("button", { name: new RegExp(` — ${T.availability.legendPartial}$`) });
    const free = section.getByRole("button", { name: new RegExp(` — (${T.availability.legendAvailable}|${T.availability.legendPartial})$`) });
    await ((await partial.count()) ? partial : free).first().click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await page.waitForTimeout(400); // dialog entrance
    // The full page shrinks the dialog past reading; keep a close-up too.
    await page.getByRole("dialog").screenshot({ path: join(OUT, `availability-day-dialog-${page.viewportSize()?.width}.png`) });
    await capture(page, testInfo, "availability-day", slug);
    await page.keyboard.press("Escape");
  }
});

test("booking page, availability house detail", async ({ page, context }, testInfo) => {
  const slug = requireSlug();
  session = await startSession(page, context);
  for (const width of widthsFor(testInfo)) {
    if (width) await page.setViewportSize({ width, height: 800 });
    await page.goto(`/${slug}/book`);
    const section = page.locator("section").filter({ has: page.getByRole("heading", { name: T.availability.title }) });
    const free = section.getByRole("button", { name: new RegExp(` — (${T.availability.legendAvailable}|${T.availability.legendPartial})$`) });
    await free.first().click();
    const dialog = page.getByRole("dialog");
    await dialog.getByRole("button", { name: T.availability.viewDetails }).first().click();
    await expect(dialog.getByRole("button", { name: T.availability.bookThisHouse })).toBeVisible();
    await page.waitForTimeout(800); // photos load
    await dialog.screenshot({ path: join(OUT, `availability-detail-dialog-${page.viewportSize()?.width}.png`) });
    // Scrolled to the end: whichever box scrolls (the body between the pinned header and footer).
    await dialog.evaluate((el) => {
      for (const n of [el, ...el.querySelectorAll("*")]) {
        if (getComputedStyle(n).overflowY === "auto" && n.scrollHeight > n.clientHeight) n.scrollTo(0, n.scrollHeight);
      }
    });
    await page.waitForTimeout(300);
    await dialog.screenshot({ path: join(OUT, `availability-detail-dialog-end-${page.viewportSize()?.width}.png`) });
    // Overflow evidence: content wider than the dialog means a sideways scroll.
    const box = await dialog.evaluate((el) => ({ client: el.clientWidth, scroll: el.scrollWidth }));
    writeFileSync(join(OUT, `availability-detail-${page.viewportSize()?.width}.overflow.json`), JSON.stringify(box));
    await capture(page, testInfo, "availability-detail", slug);
    await page.keyboard.press("Escape");
  }
});

test("booking page, payment step", async ({ page, context }, testInfo) => {
  const slug = requireSlug();
  // Holds and the draft are stubbed by startSession; nothing reaches the database.
  session = await startSession(page, context, { mode: "normal" });
  for (const width of widthsFor(testInfo)) {
    if (width) await page.setViewportSize({ width, height: 800 });
    await reachPayment(page, slug);
    await capture(page, testInfo, "payment", slug);
  }
});

test("booking page, payment step, quick-booking host", async ({ page, context }, testInfo) => {
  const slug = requireSlug();
  session = await startSession(page, context, { mode: "quick" });
  for (const width of widthsFor(testInfo)) {
    if (width) await page.setViewportSize({ width, height: 800 });
    await reachPayment(page, slug);
    await capture(page, testInfo, "payment-quick", slug);
  }
});

/** /{slug}/change-booking with a stubbed booking: the result, the form, extra payment, and the sent dialog. */
test("change-booking page", async ({ page, context }, testInfo) => {
  const slug = requireSlug();
  const t = T.bookingSearch;
  session = await startSession(page, context);
  await stubChangeBooking(page);
  for (const width of widthsFor(testInfo)) {
    if (width) await page.setViewportSize({ width, height: 800 });
    session.respond("PREVIEW /api/bookings/change-dates", {
      body: { preview: true, new_total_price: 4500, old_total_price: 3000, price_difference: 1500, additional_payment: 1500, amount_paid: 3000, payment_type: "full", deposit_available: false, new_deposit: 0, full_outstanding: 1500 },
    });

    await findBooking(page, slug);
    await capture(page, testInfo, "change-result", slug);

    // The preview prices a stay that costs ฿1,500 more: the payment section shows at once.
    await page.getByRole("button", { name: t.changeDates }).click();
    await chooseNewStay(page);
    await expect(page.getByText(t.additionalPaymentShort).first()).toBeVisible();
    await page.waitForTimeout(400);
    await capture(page, testInfo, "change-payment", slug);

    // A stay at the same price: the form, then the sent dialog.
    session.respond("PREVIEW /api/bookings/change-dates", { body: CHANGE_PREVIEW_SAME_PRICE });
    await findBooking(page, slug);
    await page.getByRole("button", { name: t.changeDates }).click();
    await chooseNewStay(page);
    await expect(page.getByRole("button", { name: t.submitDateChange })).toBeEnabled();
    await page.waitForTimeout(400);
    await capture(page, testInfo, "change-form", slug);
    await page.getByRole("button", { name: t.submitDateChange }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByRole("heading", { name: t.dcSentTitle })).toBeVisible();
    await dialog.evaluate((el) => Promise.allSettled(el.ownerDocument.getAnimations().map((a) => a.finished)));
    await capture(page, testInfo, "change-sent", slug);
  }
});

/** /{slug}/check-in-out with three stubbed bookings: ready to check in, checked in with a balance, completed. */
test("check-in-out page", async ({ page, context }, testInfo) => {
  const slug = requireSlug();
  const t = T.bookingSearch;
  session = await startSession(page, context);
  const ago = new Date(Date.now() - 86_400_000).toISOString();
  await page.route("**/api/bookings/search*", (route) =>
    route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        bookings: [
          stubbedBooking(),
          stubbedBooking({ id: "b0000000-0000-4000-8000-00000000e2e1", check_in: ago.slice(0, 10), payment_type: "deposit", amount_paid: 1000, checked_in_at: ago }),
          stubbedBooking({ id: "b0000000-0000-4000-8000-00000000e2e2", status: "completed", checked_in_at: ago, checked_out_at: ago }),
        ],
      }),
    }),
  );
  for (const width of widthsFor(testInfo)) {
    if (width) await page.setViewportSize({ width, height: 800 });
    await page.goto(`/${slug}/check-in-out`);
    await fillGuestLookup(page, t);
    await page.getByRole("button", { name: t.search, exact: true }).click();
    await expect(page.getByRole("button", { name: t.checkIn, exact: true })).toBeVisible();
    await page.waitForTimeout(400);
    await capture(page, testInfo, "cio-result", slug);

    // Only opens the balance panel; nothing is paid, checked in or out.
    await page.getByRole("button", { name: /฿2,000/ }).click();
    const transfer = page.getByRole("button", { name: t.payViaTransfer });
    if (await transfer.isVisible()) await transfer.click();
    await page.waitForTimeout(400);
    await capture(page, testInfo, "cio-balance", slug);

    // Cash: only a note that the host records it; nothing is sent.
    await page.goto(`/${slug}/check-in-out`);
    await fillGuestLookup(page, t);
    await page.getByRole("button", { name: t.search, exact: true }).click();
    await page.getByRole("button", { name: /฿2,000/ }).click();
    await page.getByRole("button", { name: t.payViaCash }).click();
    await page.waitForTimeout(400);
    await capture(page, testInfo, "cio-cash", slug);
  }
});

/** /{slug}/reviews: the lookup form, then the eligible stay the stubbed lookup returns. */
test("reviews page", async ({ page, context }, testInfo) => {
  const slug = requireSlug();
  const t = T.reviewsPage;
  session = await startSession(page, context);
  // The lookup is a read but a POST, so the write guard would abort it unstubbed.
  await page.route("**/api/reviews/lookup", (route) =>
    route.fulfill({ contentType: "application/json", body: JSON.stringify({ bookings: [stubbedBooking({ status: "completed" })] }) }),
  );
  for (const width of widthsFor(testInfo)) {
    if (width) await page.setViewportSize({ width, height: 800 });
    await page.goto(`/${slug}/reviews`);
    await fillGuestLookup(page, t);
    await capture(page, testInfo, "reviews-lookup", slug);
    await page.getByRole("button", { name: t.lookupButton }).click();
    await expect(page.getByText(t.selectBooking)).toBeVisible();
    await capture(page, testInfo, "reviews-result", slug);
  }
});
