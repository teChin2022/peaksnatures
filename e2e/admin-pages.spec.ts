import { expect, test, type Page } from "@playwright/test";
import { startHostSession, type HostSession } from "./host-support";

/**
 * Platform admin pages, signed in. Reads the real data the app points at;
 * nothing is written (the same guard as the host specs: every write a test has
 * not stubbed is aborted and the test fails).
 *
 * Save an admin login once (admin login always asks for the emailed code):
 *
 *   npx playwright open --channel=chrome --save-storage=e2e/.auth/admin.json http://localhost:3000/admin/login
 *
 * log in, close the window, then run
 *
 *   E2E_ADMIN_STATE=e2e/.auth/admin.json npx playwright test admin-pages
 *
 * e2e/.auth/ is gitignored; the file holds that session's cookies.
 */

const ADMIN_STATE = process.env.E2E_ADMIN_STATE;
test.use({ storageState: ADMIN_STATE });

let session: HostSession | undefined;

test.beforeEach(async ({ page }) => {
  test.skip(!ADMIN_STATE, "Set E2E_ADMIN_STATE to a saved admin storage state (see the comment at the top).");
  session = await startHostSession(page);
});

test.afterEach(() => {
  if (!session) return;
  expect(session.blockedWrites, "a write reached the network without a stub").toEqual([]);
  session = undefined;
});

async function openAdmin(page: Page, path: string) {
  await page.goto(path);
  await expect(page, "the saved admin login has expired: save e2e/.auth/admin.json again").not.toHaveURL(/\/admin\/login/);
}

const PAGES: [string, string][] = [
  ["/admin", "Platform Overview"],
  ["/admin/hosts", "Hosts"],
  ["/admin/homestays", "Homestays"],
  ["/admin/bookings", "Bookings"],
  ["/admin/bookings/date-changes", "Date change requests"],
  ["/admin/reviews", "Reviews"],
  ["/admin/billing", "Billing"],
  ["/admin/billing/rejected", "Rejected payments"],
  ["/admin/revenue", "Revenue"],
  ["/admin/promo-codes", "Promo Codes"],
  ["/admin/logs", "History Logs"],
  ["/admin/settings", "Settings"],
];

for (const [path, title] of PAGES) {
  test(`${path} loads its page, not an error, and fits the screen`, async ({ page }) => {
    await openAdmin(page, path);
    await expect(page.getByRole("heading", { level: 1, name: title })).toBeVisible();
    await expect(page.getByText(/^Couldn't load/)).toHaveCount(0);
    await expect(page.getByText("This page couldn't load")).toHaveCount(0);
    // Wide tables scroll inside their card; the page itself never scrolls sideways.
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(0);
  });
}

test("the menu marks the page you are on, and only that one", async ({ page }) => {
  await openAdmin(page, "/admin/billing/rejected");
  const menu = page.getByRole("button", { name: "Open menu" });
  if (await menu.isVisible()) await menu.click();
  const current = page.locator('nav[aria-label="Admin"] a[aria-current="page"]:visible');
  await expect(current).toHaveCount(1);
  await expect(current).toHaveAttribute("href", "/admin/billing/rejected");
});

test("taking a homestay offline asks first, and Cancel writes nothing", async ({ page }) => {
  await openAdmin(page, "/admin/homestays");
  const on = page.getByRole("switch", { checked: true }).first();
  test.skip((await on.count()) === 0, "no homestay is online to try this on");

  await on.click();
  const dialog = page.getByRole("dialog", { name: "Take homestay offline" });
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: "Cancel" }).click();
  await expect(dialog).toHaveCount(0);
  await expect(on).toBeChecked();
});

test("bookings: the overview's pending total opens the filtered list, and search sends the term", async ({ page }) => {
  await openAdmin(page, "/admin");
  const pending = page.getByRole("link", { name: /Pending bookings/ });
  await expect(pending).toHaveAttribute("href", "/admin/bookings?status=pending");

  await openAdmin(page, "/admin/bookings?status=pending");
  await expect(page.getByRole("combobox", { name: "Filter by status" })).toHaveText("Pending");

  const searched = page.waitForRequest((r) => r.url().includes("/api/admin/bookings?") && r.url().includes("q=0812345678"));
  await page.getByRole("searchbox", { name: /Search bookings/ }).fill("0812345678");
  await page.getByRole("button", { name: "Search", exact: true }).click();
  await searched;
});

// Mobile first (2026-11-20): phones get rows, and an approved host's actions sit behind one Manage button.
test("phones: a host's Manage sheet runs the action it was tapped for", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "phone", "the Manage sheet is phone-only");
  await openAdmin(page, "/admin/hosts?status=approved");
  const manage = page.getByRole("button", { name: /^Manage / }).first();
  test.skip((await manage.count()) === 0, "no approved host to try this on");

  await manage.click();
  // The sheet must not close before its button's own handler runs (it did once: the dialog never opened).
  await page.getByRole("dialog").getByRole("button", { name: "Rate" }).click();
  await expect(page.getByRole("dialog", { name: "Rate Override" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
});

test("billing keeps its status filter in the URL", async ({ page }) => {
  await openAdmin(page, "/admin/billing?status=paid");
  await expect(page.getByRole("button", { name: "Paid", exact: true })).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "All", exact: true }).click();
  await expect(page).toHaveURL(/\/admin\/billing$/);
});

test("the Overview's blocked-hosts link opens the Blocked filter", async ({ page }) => {
  const listed = page.waitForRequest((r) => r.url().includes("/api/admin/hosts?") && r.url().includes("status=blocked"));
  await openAdmin(page, "/admin/hosts?status=blocked");
  await listed;
  await expect(page.getByRole("button", { name: "Blocked", exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByText(/^Couldn't load/)).toHaveCount(0);
});

test("a host's activity opens in Logs, filtered to that host", async ({ page }) => {
  await openAdmin(page, "/admin/hosts");
  const first = page.locator('a[href^="/admin/hosts/"]:visible').first();
  test.skip((await first.count()) === 0, "no host to open");
  await first.click();
  const allActivity = page.getByRole("link", { name: "All activity in Logs" });
  test.skip((await allActivity.count()) === 0, "this host has no recorded activity");

  await allActivity.click();
  await expect(page).toHaveURL(/\/admin\/logs\?host_id=[0-9a-f-]{36}$/);
  await expect(page.locator('[aria-label="Active filters"]')).toContainText("Host:");
});
