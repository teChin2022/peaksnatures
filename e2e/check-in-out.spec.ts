import { expect, test, type Page } from "@playwright/test";
import { T, expectNoUnexpectedWrites, requireSlug, startSession, stubbedBooking, type Session } from "./support";

/**
 * A guest checks in and out on /{slug}/check-in-out. The page is real; the
 * booking the search finds and the check-in/check-out answers are stubbed, so
 * nothing is read from or written to a real booking.
 */

const t = T.bookingSearch;
const daysAgo = (days: number) => new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10);

let session: Session;
let checkinCalls: Record<string, unknown>[];

test.afterEach(() => {
  if (session) expectNoUnexpectedWrites(session);
});

async function open(
  page: Page,
  context: Parameters<typeof startSession>[1],
  booking: Record<string, unknown>,
  checkinAnswer: { status?: number; body: unknown } = { body: { success: true } },
) {
  const slug = requireSlug();
  session = await startSession(page, context);
  checkinCalls = [];
  await page.route("**/api/bookings/search*", (route) =>
    route.fulfill({ contentType: "application/json", body: JSON.stringify({ bookings: [stubbedBooking(booking)] }) }),
  );
  await page.route("**/api/bookings/checkin", (route) => {
    checkinCalls.push(route.request().postDataJSON());
    return route.fulfill({ status: checkinAnswer.status ?? 200, contentType: "application/json", body: JSON.stringify(checkinAnswer.body) });
  });
  await page.goto(`/${slug}/check-in-out`);
  const search = page.getByPlaceholder(t.placeholder);
  await expect(search).toBeEnabled();
  await search.fill("0898765432");
  await page.getByRole("button", { name: t.search, exact: true }).click();
}

const checkInButton = (page: Page) => page.getByRole("button", { name: t.checkIn, exact: true });
const checkOutButton = (page: Page) => page.getByRole("button", { name: t.checkOut, exact: true });

test("the back link has a name on every width", async ({ page, context }) => {
  await open(page, context, {});
  await expect(page.getByRole("link", { name: T.reviewsPage.backToHomestay })).toBeVisible();
});

test("before the stay, check-in is disabled and says when it opens", async ({ page, context }) => {
  await open(page, context, {}); // 40 days out
  await expect(checkInButton(page)).toBeDisabled();
  await expect(page.getByText(t.checkInFrom.replace("{date}", ""), { exact: false })).toBeVisible();
  expect(checkinCalls).toEqual([]);
});

test("on the day, check-in asks first and only then checks in", async ({ page, context }) => {
  await open(page, context, { check_in: daysAgo(0), check_out: daysAgo(-2) });
  await checkInButton(page).click();

  // "Not yet" backs out without a request.
  await page.getByRole("button", { name: t.checkInNotYet }).click();
  expect(checkinCalls).toEqual([]);

  await checkInButton(page).click();
  await page.getByRole("button", { name: t.checkInConfirm }).click();
  await expect(page.getByText(t.checkedInAt.replace("{time}", ""), { exact: false })).toBeVisible();
  expect(checkinCalls).toEqual([expect.objectContaining({ action: "checkin" })]);
  // The status badge moves on with the stay; it no longer says "confirmed".
  await expect(page.getByText(t.status.confirmed, { exact: true })).toHaveCount(0);
});

test("a server refusal shows a Thai message, not the API's English", async ({ page, context }) => {
  await open(page, context, { check_in: daysAgo(1) }, { status: 400, body: { error: "ALREADY_CHECKED_IN", message: "Already checked in" } });
  await checkInButton(page).click();
  await page.getByRole("button", { name: t.checkInConfirm }).click();
  await expect(page.getByText(t.alreadyCheckedIn)).toBeVisible();
  await expect(page.getByText("Already checked in")).toHaveCount(0);
});

test("with a balance due, check-out shows but stays disabled until it is paid", async ({ page, context }) => {
  const checkedIn = new Date(Date.now() - 86_400_000).toISOString();
  await open(page, context, { check_in: daysAgo(1), payment_type: "deposit", amount_paid: 1000, checked_in_at: checkedIn });
  await expect(page.getByText(t.balanceBeforeCheckout)).toBeVisible();
  await expect(checkOutButton(page)).toBeDisabled();
  await expect(page.getByRole("button", { name: t.payRemaining.replace("{amount}", "2,000") })).toBeVisible();
  expect(checkinCalls).toEqual([]);
});

test("paid in full, check-out goes through and offers a review", async ({ page, context }) => {
  const checkedIn = new Date(Date.now() - 86_400_000).toISOString();
  await open(page, context, { check_in: daysAgo(1), checked_in_at: checkedIn });
  await checkOutButton(page).click();
  await expect(page.getByRole("button", { name: T.reviews.writeReview })).toBeVisible();
  expect(checkinCalls).toEqual([expect.objectContaining({ action: "checkout" })]);
});
