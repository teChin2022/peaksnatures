import { expect, test, type Page } from "@playwright/test";
import { T, expectNoUnexpectedWrites, requireSlug, startSession, type Session } from "./support";

/**
 * A guest asks to change their house or dates on /{slug}/change-booking. The
 * homestay page itself is real; the booking the search finds, the houses, the
 * availability and the change request are stubbed, so nothing is read from or
 * written to a real booking. The host's Facebook link and phone are written
 * into the page's own payload, so the contact buttons are tested whatever the
 * real host has set.
 */

const t = T.bookingSearch;
const FACEBOOK = "https://www.facebook.com/e2e.homestay";
const PHONE = "0812345678";
const BOOKING_ID = "b0000000-0000-4000-8000-00000000e2e0";
const HOUSES = [
  { id: "house-a", name: "บ้านริมธาร" },
  { id: "house-b", name: "บ้านบนเนิน" },
];

const isoDaysAhead = (days: number) => new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10);

let session: Session;

test.afterEach(() => {
  if (session) expectNoUnexpectedWrites(session);
});

/** Writes `value` over a string-or-null prop in the server-rendered payload. */
function rewriteProp(html: string, prop: string, value: string) {
  let replaced = 0;
  const out = html.replace(new RegExp(`(${prop}(\\\\*)"\\s*:\\s*)(?:null|\\\\*"[^"\\\\]*\\\\*")`, "g"), (_m, head: string, esc: string) => {
    replaced += 1;
    return `${head}${esc}"${value}${esc}"`;
  });
  expect(replaced, `${prop} was not found in the page payload; has the Next.js payload format changed?`).toBeGreaterThan(0);
  return out;
}

async function openChangeForm(page: Page, context: Parameters<typeof startSession>[1]) {
  const slug = requireSlug();
  session = await startSession(page, context);

  await page.route(/\/change-booking(\?.*)?$/, async (route) => {
    if (route.request().resourceType() !== "document") return route.fallback();
    const response = await route.fetch();
    let html = await response.text();
    html = rewriteProp(html, "facebookUrl", FACEBOOK);
    html = rewriteProp(html, "hostPhone", PHONE);
    return route.fulfill({ response, body: html });
  });
  await page.route("**/api/bookings/search*", (route) =>
    route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        bookings: [
          {
            id: BOOKING_ID, guest_name: "ทดสอบ ระบบ", guest_email: "e2e@example.com", guest_phone: "0898765432",
            check_in: isoDaysAhead(40), check_out: isoDaysAhead(42), num_guests: 2, total_price: 3000, amount_paid: 3000,
            payment_type: "full", status: "confirmed", room_id: HOUSES[0].id, group_id: null, room_name: HOUSES[0].name,
            checked_in_at: null, checked_out_at: null, created_at: new Date().toISOString(), selected_options: null,
            has_review: false, pending_date_change: null,
          },
        ],
      }),
    }),
  );
  await page.route("**/api/bookings/availability*", (route) =>
    route.fulfill({ contentType: "application/json", body: JSON.stringify({ bookedRanges: [] }) }),
  );
  // The form reads houses and blocked nights straight from Supabase.
  await page.route(/\/rest\/v1\/rooms\?/, (route) =>
    route.fulfill({
      contentType: "application/json",
      body: JSON.stringify(route.request().url().includes("quantity") ? { quantity: 1 } : HOUSES),
    }),
  );
  await page.route(/\/rest\/v1\/blocked_dates\?/, (route) => route.fulfill({ contentType: "application/json", body: "[]" }));
  await page.route("**/api/bookings/change-dates", (route) => {
    session.calls.push({ method: "POST", path: "/api/bookings/change-dates", body: route.request().postDataJSON() });
    return route.fulfill({
      status: 201,
      contentType: "application/json",
      body: JSON.stringify({ success: true, request: { id: "dcr-e2e" }, price_difference: 0, new_total_price: 3000 }),
    });
  });

  await page.goto(`/${slug}/change-booking`);
  const search = page.getByPlaceholder(t.placeholder);
  await expect(search).toBeEnabled();
  await search.fill(BOOKING_ID.slice(0, 8));
  await page.getByRole("button", { name: t.search, exact: true }).click();

  const open = page.getByRole("button", { name: t.changeDates });
  await expect(open).toHaveText(T.bookingSearch.changeDates);
  await open.click();
}

/** Picks a two-night stay next month, where every day is in the future. */
async function chooseNewStay(page: Page) {
  await page.locator("nav button").last().click();
  const days = page.locator("button[data-day]:not([disabled])");
  await expect(days.nth(10)).toBeVisible();
  await days.nth(8).click();
  await days.nth(10).click();
}

async function submit(page: Page) {
  const button = page.getByRole("button", { name: t.submitDateChange });
  await expect(button).toBeEnabled();
  await button.click();
}

const changePosts = () => session.calls.filter((c) => c.path === "/api/bookings/change-dates");

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
  // The house <select> has no accessible name, so it is found by its options.
  await page.locator("select").filter({ has: page.locator(`option[value="${HOUSES[1].id}"]`) }).selectOption(HOUSES[1].id);
  await chooseNewStay(page);
  await submit(page);

  const dialog = page.getByRole("dialog");
  await expect(dialog.getByText(t.dcSentRoom.replace("{room}", HOUSES[1].name))).toBeVisible();
  expect(changePosts()[0].body).toMatchObject({ booking_id: BOOKING_ID, new_room_id: HOUSES[1].id });
});
