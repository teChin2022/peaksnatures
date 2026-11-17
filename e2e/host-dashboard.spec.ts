import { expect, test } from "@playwright/test";
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

test("bookings: a pending booking is confirmed from the Pending tab", async ({ page }) => {
  await session!.stubWrite("POST", /\/api\/bookings\/update-status$/, (request) => ({
    body: { member_ids: [(request.postDataJSON() as { booking_id: string }).booking_id] },
  }));
  await openDashboard(page, "/dashboard/bookings?tab=pending");

  const tab = page.getByRole("tab", { name: new RegExp(`^${T.dashboard.pending}`) });
  await expect(tab).toHaveAttribute("aria-selected", "true");
  const panel = page.locator("[role=tabpanel][data-state=active]");
  const confirm = panel.getByRole("button", { name: T.dashboard.confirm, exact: true });
  await expect(panel.locator(".animate-pulse")).toHaveCount(0); // first page loaded
  test.skip((await confirm.count()) === 0, "The test host has no pending booking to confirm.");

  const before = await confirm.count();
  await confirm.first().click();
  await expect(confirm).toHaveCount(before - 1);
  expect(session!.writes.map((w) => w.key)).toContain("POST /api/bookings/update-status");
});

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
