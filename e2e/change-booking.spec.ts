import { expect, test, type Page } from "@playwright/test";
import { CHANGE, T, chooseNewStay, expectNoUnexpectedWrites, findBooking, requireSlug, startSession, stubChangeBooking, stubbedBooking, type Session } from "./support";

/**
 * A guest asks to change their house or dates on /{slug}/change-booking. The
 * homestay page itself is real; the booking the search finds, the houses, the
 * availability and the change request are stubbed (support.ts), so nothing is
 * read from or written to a real booking. The host's Facebook link and phone
 * are written into the page's own payload, so the contact buttons are tested
 * whatever the real host has set.
 */

const t = T.bookingSearch;
const { phone: PHONE, bookingId: BOOKING_ID, houses: HOUSES } = CHANGE;

let session: Session;

test.afterEach(() => {
  if (session) expectNoUnexpectedWrites(session);
});

async function openChangeForm(page: Page, context: Parameters<typeof startSession>[1]) {
  const slug = requireSlug();
  session = await startSession(page, context);
  await stubChangeBooking(page);
  await findBooking(page, slug);
  await page.getByRole("button", { name: t.changeDates }).click();
}

async function submit(page: Page) {
  const button = page.getByRole("button", { name: t.submitDateChange });
  await expect(button).toBeEnabled();
  await button.click();
}

/** Change requests the page sent, not counting price previews. */
const changePosts = () => session.calls.filter((c) => c.path === "/api/bookings/change-dates" && !c.body?.preview);
const previews = () => session.calls.filter((c) => c.path === "/api/bookings/change-dates" && c.body?.preview === true);

test("the buttons say the guest can change the house or the dates", async ({ page, context }) => {
  await openChangeForm(page, context);
  expect(t.changeDates).toBe("เปลี่ยนบ้านพัก / วันที่");
  expect(t.submitDateChange).toBe("ส่งคำขอเปลี่ยนบ้านพัก / วันที่");
  await chooseNewStay(page);
  await expect(page.getByRole("button", { name: t.submitDateChange })).toBeVisible();
});

test("after a date change, a dialog asks the guest to message or call the host", async ({ page, context }, info) => {
  await openChangeForm(page, context);
  await chooseNewStay(page);
  await submit(page);

  const dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("heading", { name: t.dcSentTitle })).toBeVisible();
  await expect(dialog.getByText(t.dcSentDesc)).toBeVisible();
  await expect(dialog.getByText(t.dcSentRoom.split(":")[0])).toHaveCount(0);

  const chat = dialog.getByRole("link", { name: t.dcSentChat });
  await expect(chat).toHaveAttribute("href", "https://m.me/e2e.homestay");
  await expect(chat).toHaveAttribute("target", "_blank");
  await expect(dialog.getByRole("link", { name: T.booking.hostContactCall.replace("{phone}", PHONE) })).toHaveAttribute("href", `tel:${PHONE}`);

  // The whole dialog, title to close button, fits on the screen once it has finished opening.
  await dialog.evaluate((el) => Promise.allSettled(el.ownerDocument.getAnimations().map((a) => a.finished)));
  const box = (await dialog.boundingBox())!;
  const viewport = page.viewportSize()!;
  expect(box.y).toBeGreaterThanOrEqual(0);
  expect(box.y + box.height).toBeLessThanOrEqual(viewport.height);
  await page.screenshot({ path: info.outputPath("date-change-sent.png") });

  expect(changePosts()).toHaveLength(1);
  expect(changePosts()[0].body).not.toHaveProperty("new_room_id");

  await dialog.getByRole("button", { name: t.dcSentClose }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByText(t.dateChangePending)).toBeVisible();
});

test("after a house change, the dialog names the new house", async ({ page, context }) => {
  await openChangeForm(page, context);
  await page.getByLabel(t.selectRoom).selectOption(HOUSES[1].id);
  await chooseNewStay(page);
  await submit(page);

  const dialog = page.getByRole("dialog");
  await expect(dialog.getByText(t.dcSentRoom.replace("{room}", HOUSES[1].name))).toBeVisible();
  expect(changePosts()[0].body).toMatchObject({ booking_id: BOOKING_ID, new_room_id: HOUSES[1].id });
});

test("the page's controls have names a screen reader can read", async ({ page, context }) => {
  await openChangeForm(page, context);
  await expect(page.getByRole("link", { name: T.reviewsPage.backToHomestay })).toBeVisible();
  await expect(page.getByLabel(t.selectRoom)).toBeVisible();
  const back = page.getByRole("button", { name: t.cancelDateChange }).first();
  const box = (await back.boundingBox())!;
  expect(Math.round(Math.min(box.width, box.height))).toBeGreaterThanOrEqual(44);
  await back.click();
  await expect(page.getByRole("button", { name: t.changeDates })).toBeVisible();
});

test("if the price rose after the preview, the summary comes into view and the button names the payment", async ({ page, context }) => {
  await openChangeForm(page, context);
  session.respond("POST /api/bookings/change-dates", {
    status: 402,
    body: { error: "PAYMENT_REQUIRED", price_difference: 1500, additional_payment: 1500, new_total_price: 4500, amount_paid: 3000, deposit_available: false, new_deposit: 0, full_outstanding: 1500 },
  });
  await chooseNewStay(page);
  await page.getByRole("button", { name: t.submitDateChange }).click();

  const summary = page.getByLabel(t.dcPriceSummary);
  // Scrolled up into the top third of the screen (as far as the page allows),
  // not left where it rendered, below the slip upload.
  const third = page.viewportSize()!.height / 3;
  await expect.poll(async () => (await summary.boundingBox())?.y ?? -1).toBeGreaterThanOrEqual(0);
  await expect.poll(async () => (await summary.boundingBox())?.y ?? 9999).toBeLessThan(third);
  await expect(summary.getByText(t.additionalPaymentShort)).toBeVisible();
  // The amount due is stated once in the summary, not again in notes under it.
  await expect(page.getByText("฿1,500", { exact: true })).toHaveCount(1);
  const pay = page.getByRole("button", { name: t.dcConfirmPaySubmit.replace("{amount}", "1,500") });
  await expect(pay).toBeVisible();
  // No slip yet: the request cannot be sent.
  await expect(pay).toBeDisabled();
  expect(changePosts()).toHaveLength(1);
});

test("a booking that cannot be changed says why", async ({ page, context }) => {
  const slug = requireSlug();
  session = await startSession(page, context);
  await stubChangeBooking(page);
  await page.route("**/api/bookings/search*", (route) =>
    route.fulfill({ contentType: "application/json", body: JSON.stringify({ bookings: [stubbedBooking({ status: "pending" })] }) }),
  );
  await page.goto(`/${slug}/change-booking`);
  await page.getByPlaceholder(t.placeholder).fill(BOOKING_ID.slice(0, 8));
  await page.getByRole("button", { name: t.search, exact: true }).click();
  await expect(page.getByText(t.dcNotChangeable)).toBeVisible();
  await expect(page.getByRole("button", { name: t.changeDates })).toHaveCount(0);
});

test("a change to a cheaper stay warns that the difference is not refunded before it can be sent", async ({ page, context }) => {
  await openChangeForm(page, context);
  session.respond("PREVIEW /api/bookings/change-dates", {
    body: { preview: true, new_total_price: 2500, old_total_price: 3000, price_difference: -500, additional_payment: 0, amount_paid: 3000, payment_type: "full", deposit_available: false, new_deposit: 0, full_outstanding: 0 },
  });
  await chooseNewStay(page);

  const acknowledge = page.getByRole("checkbox", { name: t.noRefundWarning.replace("{amount}", "500") });
  await expect(acknowledge).toBeVisible();
  const send = page.getByRole("button", { name: t.submitDateChange });
  await expect(send).toBeDisabled();
  expect(changePosts()).toHaveLength(0);

  await acknowledge.check();
  await send.click();
  await expect(page.getByRole("dialog").getByRole("heading", { name: t.dcSentTitle })).toBeVisible();
  expect(changePosts()).toHaveLength(1);
  expect(changePosts()[0].body).not.toHaveProperty("preview");
});

test("a change that costs more shows what to pay before anything is sent", async ({ page, context }) => {
  await openChangeForm(page, context);
  session.respond("PREVIEW /api/bookings/change-dates", {
    body: { preview: true, new_total_price: 4500, old_total_price: 3000, price_difference: 1500, additional_payment: 1500, amount_paid: 3000, payment_type: "full", deposit_available: false, new_deposit: 0, full_outstanding: 1500 },
  });
  await chooseNewStay(page);

  await expect(page.getByLabel(t.dcPriceSummary).getByText(t.additionalPaymentShort)).toBeVisible();
  await expect(page.getByRole("button", { name: t.uploadSlip })).toBeVisible();
  await expect(page.getByRole("button", { name: t.dcConfirmPaySubmit.replace("{amount}", "1,500") })).toBeDisabled();
  expect(previews()).toHaveLength(1);
  expect(previews()[0].body).toMatchObject({ booking_id: BOOKING_ID, preview: true });
  expect(changePosts()).toHaveLength(0);
});
