import { expect, test, type Page } from "@playwright/test";
import { HOST_STATE, T, clickNav, openDashboard, requireHost, startHostSession, type HostSession } from "./host-support";

/**
 * Host dashboard flows from the 2026-11-17 critique: saving the homestay page,
 * the unsaved-changes guards, a blank house price, and confirming a booking
 * from the Pending tab. Reads the test host's real data; writes are stubbed.
 *
 *   E2E_HOST_STATE=e2e/.auth/host.json npx playwright test host-dashboard
 */

test.use({ storageState: HOST_STATE });

let session: HostSession | undefined;

test.beforeEach(async ({ page }) => {
  requireHost();
  session = await startHostSession(page);
});

test.afterEach(() => {
  if (!session) return; // skipped before it started (no saved login)
  expect(session.blockedWrites, "a write reached the network without a stub").toEqual([]);
  session = undefined;
});

const H = T.dashboardHomestay;

test("homestay: an edit shows the save bar, and saving writes it and clears the bar", async ({ page }) => {
  await session!.stubWrite("PATCH", /\/rest\/v1\/(homestays|hosts)\b/, () => ({ status: 204 }));
  await session!.stubWrite("POST", /\/api\/history-log$/, () => ({ body: { ok: true } }));
  await openDashboard(page, "/dashboard/homestay");

  const tagline = page.locator("#homestay-tagline");
  await tagline.fill(`${await tagline.inputValue()} e2e`);
  const status = page.getByRole("status").filter({ hasText: H.unsavedChanges });
  await expect(status).toBeVisible();

  await page.getByRole("button", { name: H.save }).click();
  await expect(page.getByText(H.saved)).toBeVisible();
  await expect(status).toHaveCount(0);

  const homestayWrite = session!.writes.find((w) => w.key.endsWith("/homestays"));
  expect((homestayWrite?.body as { tagline?: string })?.tagline).toMatch(/ e2e$/);
});

test("homestay: leaving with unsaved edits asks first, by link and by Back", async ({ page }) => {
  await openDashboard(page, "/dashboard");
  await clickNav(page, "/dashboard/homestay");
  await expect(page).toHaveURL(/\/dashboard\/homestay$/);

  await page.locator("#homestay-tagline").fill("unsaved e2e edit");

  // A menu link: held, Stay keeps the page.
  await clickNav(page, "/dashboard/bookings");
  await expect(page.getByRole("dialog", { name: H.leaveTitle })).toBeVisible();
  await page.getByRole("button", { name: H.leaveStay }).click();
  await expect(page).toHaveURL(/\/dashboard\/homestay$/);

  // Browser Back: asks too; Leave goes back for real.
  await page.goBack();
  await expect(page.getByRole("dialog", { name: H.leaveTitle })).toBeVisible();
  await page.getByRole("button", { name: H.leaveConfirm }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
});

test("houses: a blank price is refused in place, with nothing written", async ({ page }) => {
  await openDashboard(page, "/dashboard/rooms");
  await page.getByRole("button", { name: T.dashboardRooms.addRoom }).first().click();
  await page.locator("#rooms-roomName").fill("e2e house");
  await page.getByRole("button", { name: T.dashboardRooms.createRoom }).click();

  await expect(page.getByText(T.dashboardRooms.errorPrice)).toBeVisible();
  await expect(page.locator("#room-price")).toBeFocused();
  await expect(page.locator("#room-price")).toHaveAttribute("aria-invalid", "true");

  // Closing with the typed name asks before dropping it.
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog", { name: T.dashboardRooms.discardTitle })).toBeVisible();
});

/**
 * The test host rarely has a pending booking, so the bookings read is rewritten
 * in the browser to show its rows as pending with an unverified slip. Nothing is
 * written: the confirm call is stubbed by the session.
 */
async function showRowsAsPending(page: Page) {
  await page.route(/\/rest\/v1\/bookings\?/, async (route) => {
    if (route.request().method() !== "GET") return route.fallback();
    const response = await route.fetch();
    const body = await response.json().catch(() => null);
    if (!Array.isArray(body)) return route.fulfill({ response });
    return route.fulfill({ response, json: body.map((row) => ({ ...row, status: "pending", easyslip_verified: false })) });
  });
}

test("bookings: confirming shows the amount to check first, then confirms", async ({ page }) => {
  await session!.stubWrite("POST", /\/api\/bookings\/update-status$/, (request) => ({
    body: { member_ids: [(request.postDataJSON() as { booking_id: string }).booking_id] },
  }));
  await showRowsAsPending(page);
  await openDashboard(page, "/dashboard/bookings?tab=all");

  const panel = page.locator("[role=tabpanel][data-state=active]");
  // The tab panel only exists once loaded: wait for a card, not for the skeleton to go.
  await panel.getByRole("button", { name: T.dashboard.viewDetails }).first().waitFor({ timeout: 20_000 }).catch(() => {});
  const confirm = panel.getByRole("button", { name: T.dashboard.confirm, exact: true });
  test.skip((await confirm.count()) === 0, "The test host has no booking at all.");
  await confirm.first().click();

  // Confirming is irreversible, so it first shows the amount to check against the bank.
  const D = T.dashboard;
  const check = page.getByRole("dialog").filter({ hasText: D.confirmBookingAmount });
  await expect(check).toBeVisible();
  await expect(check.getByText(D.confirmBookingEffects)).toBeVisible();
  await expect(check.getByText(/^฿[\d,]+$/)).toBeVisible();
  expect(session!.writes, "nothing is written before the host confirms the check").toEqual([]);

  await check.getByRole("button", { name: D.confirmBookingButton }).click();
  await expect(check).toBeHidden();
  expect(session!.writes.map((w) => w.key)).toEqual(["POST /api/bookings/update-status"]);
  expect(session!.writes[0].body).toMatchObject({ status: "confirmed" });
});

test("bookings: closing the confirm check writes nothing", async ({ page }) => {
  await showRowsAsPending(page);
  await openDashboard(page, "/dashboard/bookings?tab=all");
  const panel = page.locator("[role=tabpanel][data-state=active]");
  await panel.getByRole("button", { name: T.dashboard.viewDetails }).first().waitFor({ timeout: 20_000 }).catch(() => {});
  const confirm = panel.getByRole("button", { name: T.dashboard.confirm, exact: true });
  test.skip((await confirm.count()) === 0, "The test host has no booking at all.");

  await confirm.first().click();
  await page.getByRole("button", { name: T.dashboard.confirmBookingKeep }).click();
  await expect(page.getByRole("dialog")).toBeHidden();
  expect(session!.writes).toEqual([]);
});

// A failed read used to look like an empty day or an all-free month.
for (const [name, path] of [
  ["check-ins", "/dashboard/checkins"],
  ["calendar", "/dashboard/calendar"],
  ["bookings", "/dashboard/bookings"],
] as const) {
  test(`${name}: a failed bookings read shows the error page, not an empty list`, async ({ page }) => {
    await page.route(/\/rest\/v1\/bookings\b/, (route) =>
      route.request().method() === "GET" ? route.fulfill({ status: 500, contentType: "application/json", body: '{"message":"e2e"}' }) : route.fallback(),
    );
    await openDashboard(page, path);
    await expect(page.getByRole("alert").filter({ hasText: T.errorPage.title })).toBeVisible();
  });
}

test("houses: a season typed but not added stops Save and says so", async ({ page }) => {
  await openDashboard(page, "/dashboard/rooms");
  await page.getByRole("button", { name: T.dashboardRooms.addRoom }).first().click();
  await page.locator("#rooms-roomName").fill("e2e house");
  await page.locator("#room-price").fill("1500");
  await page.locator("#rooms-seasonPrice").fill("2500"); // never pressed "เพิ่มช่วงราคา"
  await page.getByRole("button", { name: T.dashboardRooms.createRoom }).click();

  await expect(page.getByRole("alert").filter({ hasText: T.dashboardRooms.seasonalPricing })).toBeVisible();
  await expect(page.getByRole("dialog", { name: T.dashboardRooms.addRoom })).toBeVisible(); // not closed, nothing written
});

test("bookings: search finds a booking by its code, and filters run on the server", async ({ page }) => {
  // A filter PostgREST cannot parse comes back 400 and shows as "no results": catch it here.
  const failed: string[] = [];
  page.on("response", (r) => {
    if (/\/rest\/v1\/bookings/.test(r.url()) && r.status() >= 400) failed.push(`${r.status()} ${decodeURIComponent(r.url())}`);
  });
  await openDashboard(page, "/dashboard/bookings?tab=all");
  const panel = page.locator("[role=tabpanel][data-state=active]");
  await expect(panel.locator(".animate-pulse")).toHaveCount(0);

  const idLine = (await panel.getByText(/ID: [0-9a-f]{8}…/).first().textContent().catch(() => null)) ?? "";
  const code = /ID: ([0-9a-f]{8})…/.exec(idLine)?.[1];
  test.skip(!code, "The test host has no booking to search for.");

  const D = T.dashboard;
  const resultLine = page.getByText(new RegExp(D.filterResultCount.replace("{count}", "(\\d+)")));
  await page.getByRole("searchbox", { name: D.searchLabel }).fill(code!);
  await expect(resultLine).toBeVisible();
  expect(Number(/\d+/.exec((await resultLine.textContent()) ?? "")?.[0])).toBeGreaterThanOrEqual(1);
  await expect(panel.getByText(`ID: ${code}…`).first()).toBeVisible();

  // Pending searches its statuses and its date-change bookings in one request.
  await page.getByRole("tab", { name: new RegExp(`^${D.pending}`) }).click();
  await expect(resultLine).toBeVisible();

  await page.getByRole("tab", { name: new RegExp(`^${D.allBookings}`) }).click();
  await page.getByRole("button", { name: D.clearFilters }).first().click();
  const sheetButton = page.getByRole("button", { name: new RegExp(`^${D.filtersButton}`) });
  const inSheet = await sheetButton.isVisible(); // phones: the fields sit in a bottom sheet
  if (inSheet) await sheetButton.click();
  await page.getByRole("combobox", { name: D.filterSourceLabel }).click();
  await page.getByRole("option", { name: D.filterSourceQuick }).click();
  await page.getByRole("combobox", { name: D.filterStatus }).click();
  await page.getByRole("option", { name: D.pending, exact: true }).click();
  await page.screenshot({ path: test.info().outputPath("filters-open.png") });
  if (inSheet) {
    await page.getByRole("button", { name: new RegExp(D.filtersShowResults.replace("{count}", "\\d+")) }).click();
    await expect(page.getByRole("dialog")).toBeHidden();
  }

  await expect(page.getByRole("button", { name: D.removeFilter.replace("{name}", D.filterSourceQuick) })).toBeVisible();
  await expect(page.getByRole("button", { name: D.removeFilter.replace("{name}", D.pending) })).toBeVisible();
  await expect(resultLine).toBeVisible();
  await page.screenshot({ path: test.info().outputPath("filters-applied.png"), fullPage: true });
  expect(failed).toEqual([]);
});

test("promo codes: a failed read shows the error page, not 'no codes yet'", async ({ page }) => {
  await page.route(/\/rest\/v1\/promo_codes\b/, (route) =>
    route.request().method() === "GET" ? route.fulfill({ status: 500, contentType: "application/json", body: '{"message":"e2e"}' }) : route.fallback(),
  );
  await openDashboard(page, "/dashboard/promo-codes");
  await expect(page.getByRole("alert").filter({ hasText: T.errorPage.title })).toBeVisible();
});

test("houses: a house with bookings still to come cannot be deleted, and nothing is written", async ({ page }) => {
  const R = T.dashboardRooms;
  // The count of the house's unfinished bookings answers 2 (in the browser only).
  await page.route(/\/rest\/v1\/bookings\?.*room_id=eq\..*status=in\./, (route) =>
    route.request().method() === "HEAD"
      ? route.fulfill({ status: 200, headers: { "content-range": "*/2", "access-control-expose-headers": "content-range" } })
      : route.fallback(),
  );
  await openDashboard(page, "/dashboard/rooms");
  const deletes = page.getByRole("button", { name: new RegExp(`^${T.common.delete} `) });
  await deletes.first().waitFor({ timeout: 20_000 }).catch(() => {});
  test.skip((await deletes.count()) === 0, "The test host has no house.");

  await deletes.first().click();
  const blocked = page.getByRole("dialog", { name: R.deleteBlockedTitle });
  await expect(blocked).toBeVisible();
  await expect(blocked).toContainText(R.deleteBlockedDesc.replace("{count}", "2").slice(0, 30));
  await expect(blocked.getByRole("button", { name: T.common.delete })).toHaveCount(0);
  await blocked.getByRole("button", { name: T.common.close }).click();
  expect(session!.blockedWrites).toEqual([]);
});
