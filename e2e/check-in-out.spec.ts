import { expect, test, type Page } from "@playwright/test";
import { T, expectNoUnexpectedWrites, fillGuestLookup, requireSlug, startSession, stubbedBooking, type Session } from "./support";

/**
 * A guest checks in and out on /{slug}/check-in-out. The page is real; the
 * booking the search finds and the check-in/check-out answers are stubbed, so
 * nothing is read from or written to a real booking.
 */

const t = T.bookingSearch;
const daysAgo = (days: number) => new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10);

let session: Session;
let checkinCalls: Record<string, unknown>[];
let searchCalls: { method: string; url: string; body: unknown }[];

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
  searchCalls = [];
  await page.route("**/api/bookings/search*", (route) => {
    const request = route.request();
    searchCalls.push({ method: request.method(), url: request.url(), body: request.postDataJSON() });
    return route.fulfill({ contentType: "application/json", body: JSON.stringify({ bookings: [stubbedBooking(booking)] }) });
  });
  await page.route("**/api/bookings/checkin", (route) => {
    checkinCalls.push(route.request().postDataJSON());
    return route.fulfill({ status: checkinAnswer.status ?? 200, contentType: "application/json", body: JSON.stringify(checkinAnswer.body) });
  });
  await page.goto(`/${slug}/check-in-out`);
  await fillGuestLookup(page, t);
  await page.getByRole("button", { name: t.search, exact: true }).click();
}

const checkInButton = (page: Page) => page.getByRole("button", { name: t.checkIn, exact: true });
const checkOutButton = (page: Page) => page.getByRole("button", { name: t.checkOut, exact: true });

test("the phone and email fields have visible labels tied to them", async ({ page, context }) => {
  await open(page, context, {});
  await expect(page.getByText(t.phoneLabel, { exact: true })).toBeVisible();
  await expect(page.getByLabel(t.phoneLabel)).toHaveAttribute("placeholder", t.phonePlaceholder);
  await expect(page.getByText(t.emailLabel, { exact: true })).toBeVisible();
  await expect(page.getByLabel(t.emailLabel)).toHaveAttribute("placeholder", t.emailPlaceholder);
});

// The search used to take one value in the URL: a phone, an email or a booking
// id, each enough on its own. It now needs the phone AND the email, in the body.
test("the search sends the phone and email in the body, not the URL", async ({ page, context }) => {
  await open(page, context, {});
  await expect(checkInButton(page)).toBeVisible();
  expect(searchCalls).toHaveLength(1);
  const [call] = searchCalls;
  expect(call.method).toBe("POST");
  expect(call.url).not.toContain("0898765432");
  expect(call.body).toEqual({ homestay_id: expect.any(String), phone: "0898765432", email: "e2e@example.com" });
});

test("the search stays disabled until both the phone and the email are filled in", async ({ page, context }) => {
  session = await startSession(page, context);
  await page.goto(`/${requireSlug()}/check-in-out`);
  const searchButton = page.getByRole("button", { name: t.search, exact: true });
  const phone = page.getByPlaceholder(t.phonePlaceholder);
  await expect(phone).toBeEnabled();
  await phone.fill("0898765432");
  await expect(searchButton).toBeDisabled();
  await page.getByPlaceholder(t.emailPlaceholder).fill("e2e@example.com");
  await expect(searchButton).toBeEnabled();
});

// F-06: the booking id alone used to be enough to cancel; the route now also
// checks the guest's email, so the page must send it.
test("cancelling sends the guest's email along with the booking id", async ({ page, context }) => {
  session = await startSession(page, context);
  const cancels: unknown[] = [];
  await page.route("**/api/bookings/search*", (route) =>
    route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({ bookings: [stubbedBooking()], cancellation_days: 3 }),
    }),
  );
  await page.route("**/api/bookings/cancel", (route) => {
    cancels.push(route.request().postDataJSON());
    return route.fulfill({ contentType: "application/json", body: JSON.stringify({ success: true }) });
  });
  await page.goto(`/${requireSlug()}/check-in-out`);
  await fillGuestLookup(page, t);
  await page.getByRole("button", { name: t.search, exact: true }).click();

  await page.getByRole("button", { name: t.cancelBooking }).click();
  await page.getByRole("button", { name: t.cancelConfirmButton }).click();

  await expect.poll(() => cancels.length).toBe(1);
  expect(cancels[0]).toMatchObject({ booking_id: stubbedBooking().id, guest_email: "e2e@example.com" });
});

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

// The guest used to mark the balance paid in cash themselves. Cash is now the
// host's to record, so choosing it only says so and sends nothing.
test("choosing cash tells the guest to pay the host, and marks nothing paid", async ({ page, context }) => {
  const checkedIn = new Date(Date.now() - 86_400_000).toISOString();
  await open(page, context, { check_in: daysAgo(1), payment_type: "deposit", amount_paid: 1000, checked_in_at: checkedIn });
  await page.getByRole("button", { name: t.payRemaining.replace("{amount}", "2,000") }).click();
  await page.getByRole("button", { name: t.payViaCash }).click();

  await expect(page.getByRole("status").filter({ hasText: t.cashHandToHost.replace("{amount}", "2,000") })).toBeVisible();
  await expect(checkOutButton(page)).toBeDisabled();
  // pay-balance is not stubbed here, so a POST to it would land in blockedWrites
  // and fail the write guard in afterEach as well.
  expect(session.blockedWrites.filter((w) => w.includes("pay-balance"))).toEqual([]);
  expect(session.calls.filter((c) => c.path.includes("pay-balance"))).toEqual([]);
});

test("paid in full, check-out goes through and offers a review", async ({ page, context }) => {
  const checkedIn = new Date(Date.now() - 86_400_000).toISOString();
  await open(page, context, { check_in: daysAgo(1), checked_in_at: checkedIn });
  await checkOutButton(page).click();
  await expect(page.getByRole("button", { name: T.reviews.writeReview })).toBeVisible();
  expect(checkinCalls).toEqual([expect.objectContaining({ action: "checkout" })]);
});
