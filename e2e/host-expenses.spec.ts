import { expect, test, type Page } from "@playwright/test";
import { HOST_STATE, T, clickNav, openDashboard, requireHost, startHostSession, type HostSession } from "./host-support";
import { billingTodayStr } from "../src/lib/billing-dates";

/**
 * Income & Expenses (/dashboard/expenses, owner only): the month summary, adding
 * an expense and deleting one. The month's data is stubbed (the page reads
 * nothing else), and so are the writes.
 *
 *   E2E_HOST_STATE=e2e/.auth/host.json npx playwright test host-expenses --workers=1
 */

test.use({ storageState: HOST_STATE });

const E = T.expenses;
const MONTH = billingTodayStr().slice(0, 7);
const WAGES_ID = "5f0b6f0e-1111-4111-8111-111111111111";
const MONTH_DATA = {
  month: MONTH,
  revenue: 48500,
  commission: 2910,
  planFees: 0,
  totalExpenses: 9200,
  net: 36390,
  expenses: [
    { id: WAGES_ID, spent_on: `${MONTH}-01`, category: "wages", amount: 6000, note: "แม่บ้าน 2 คน" },
    { id: "5f0b6f0e-2222-4222-8222-222222222222", spent_on: `${MONTH}-01`, category: "utilities", amount: 3200, note: null },
  ],
};

let session: HostSession | undefined;

/** Answers the page's month reads; returns the months it asked for ("" = this month). */
async function stubMonth(page: Page, status = 200) {
  const asked: string[] = [];
  await page.route(/\/api\/host\/expenses(\?|$)/, (route) => {
    if (route.request().method() !== "GET") return route.fallback();
    const month = new URL(route.request().url()).searchParams.get("month") ?? "";
    asked.push(month);
    return status === 200
      ? route.fulfill({ status, contentType: "application/json", body: JSON.stringify({ ...MONTH_DATA, month: month || MONTH }) })
      : route.fulfill({ status, contentType: "application/json", body: JSON.stringify({ error: "Failed to load" }) });
  });
  return asked;
}

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
/** A row's edit or delete button: its label starts with the action, then the category. */
const rowButton = (aria: string, category: string) => new RegExp(`^${escape(aria.split("{")[0])}${escape(category)}`);

test.beforeEach(async ({ page }) => {
  requireHost();
  session = await startHostSession(page);
});

test.afterEach(() => {
  if (!session) return; // skipped before it started (no saved login)
  expect(session.blockedWrites, "a write reached the network without a stub").toEqual([]);
  session = undefined;
});

test("the owner's menu opens the month summary: income, charges, expenses and net profit", async ({ page }, testInfo) => {
  await stubMonth(page);
  await openDashboard(page, "/dashboard");
  await clickNav(page, "/dashboard/expenses");
  await expect(page).toHaveURL(/\/dashboard\/expenses$/);

  const summary = page.getByRole("region", { name: new RegExp(escape(E.summaryAria.split("{")[0].trim())) });
  await expect(summary.getByText(E.income)).toBeVisible();
  await expect(summary.getByText("฿48,500")).toBeVisible();
  // Platform charges, with the commission under it: the same figure twice.
  await expect(summary.getByText(E.platformFees, { exact: true })).toBeVisible();
  await expect(summary.getByText("−฿2,910")).toHaveCount(2);
  await expect(summary.getByText(E.planFees, { exact: true })).toHaveCount(0); // nothing paid for a plan this month
  // Recorded expenses as one line; the categories are in the list, not the summary.
  await expect(summary.getByText("−฿9,200")).toBeVisible();
  await expect(summary.getByText(E.categories.wages, { exact: true })).toHaveCount(0);
  await expect(summary.getByText("฿36,390")).toBeVisible();
  await expect(page.getByRole("listitem").filter({ hasText: "แม่บ้าน 2 คน" })).toBeVisible();
  // This is the current month: nothing to move forward to.
  await expect(page.getByRole("button", { name: E.nextMonth })).toBeDisabled();

  await page.screenshot({ path: testInfo.outputPath("expenses.png"), fullPage: true });
});

test("adding an expense checks the form, then saves it for the session's host", async ({ page }, testInfo) => {
  const asked = await stubMonth(page);
  await session!.stubWrite("POST", /\/api\/host\/expenses$/, () => ({ status: 201, body: { id: "new-1" } }));
  await openDashboard(page, "/dashboard/expenses");

  await page.getByRole("button", { name: E.add }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("button", { name: E.save }).click();
  await expect(dialog.getByRole("alert").filter({ hasText: E.errorCategory })).toBeVisible();
  await expect(dialog.getByRole("alert").filter({ hasText: E.errorAmountRequired })).toBeVisible();
  // The first field with an error takes focus.
  await expect(dialog.getByLabel(E.category, { exact: true })).toBeFocused();
  // No future day: that month is past the › button.
  await expect(dialog.getByLabel(E.date)).toHaveAttribute("max", billingTodayStr());
  await page.screenshot({ path: testInfo.outputPath("add-dialog-errors.png") });

  await dialog.getByLabel(E.amount).fill("450");
  await dialog.getByLabel(E.category, { exact: true }).click();
  await page.getByRole("option", { name: E.categories.laundry }).click();
  await dialog.getByLabel(E.note).fill("ผ้าปูที่นอน");
  await dialog.getByRole("button", { name: E.save }).click();

  await expect(page.getByText(E.saved)).toBeVisible();
  await expect(dialog).toBeHidden();
  expect(session!.writes).toEqual([
    {
      key: "POST /api/host/expenses",
      body: { spent_on: billingTodayStr(), category: "laundry", amount: 450, note: "ผ้าปูที่นอน" },
    },
  ]);
  // The month the expense landed in is read again.
  await expect.poll(() => asked.at(-1)).toBe(MONTH);
});

test("deleting asks first, then removes that expense", async ({ page }) => {
  await stubMonth(page);
  await session!.stubWrite("DELETE", /\/api\/host\/expenses\/[0-9a-f-]+$/, () => ({ body: { ok: true } }));
  await openDashboard(page, "/dashboard/expenses");

  await page.getByRole("button", { name: rowButton(E.deleteAria, E.categories.wages) }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByText(E.removeTitle)).toBeVisible();
  await expect(dialog.getByText("฿6,000")).toBeVisible();
  await dialog.getByRole("button", { name: E.remove, exact: true }).click();

  await expect(page.getByText(E.removed)).toBeVisible();
  expect(session!.writes.map((w) => w.key)).toEqual([`DELETE /api/host/expenses/${WAGES_ID}`]);
  // The deleted row's button is gone; focus lands on the add button, not the top of the page.
  await expect(page.getByRole("button", { name: E.add })).toBeFocused();
});

test("tapping a row opens it filled in, and saving corrects that expense", async ({ page }) => {
  const asked = await stubMonth(page);
  await session!.stubWrite("PATCH", /\/api\/host\/expenses\/[0-9a-f-]+$/, () => ({ body: { id: WAGES_ID } }));
  await openDashboard(page, "/dashboard/expenses");

  await page.getByRole("button", { name: rowButton(E.editAria, E.categories.wages) }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByText(E.editTitle)).toBeVisible();
  await expect(dialog.getByLabel(E.amount)).toHaveValue("6000");
  await expect(dialog.getByLabel(E.note)).toHaveValue("แม่บ้าน 2 คน");
  await dialog.getByLabel(E.amount).fill("6500");
  await dialog.getByRole("button", { name: E.save }).click();

  await expect(page.getByText(E.updated)).toBeVisible();
  expect(session!.writes).toEqual([
    {
      key: `PATCH /api/host/expenses/${WAGES_ID}`,
      body: { spent_on: `${MONTH}-01`, category: "wages", amount: 6500, note: "แม่บ้าน 2 คน" },
    },
  ]);
  await expect.poll(() => asked.at(-1)).toBe(MONTH);
});

test("an earlier month offers the way back to this month", async ({ page }) => {
  const asked = await stubMonth(page);
  await openDashboard(page, "/dashboard/expenses");
  const back = page.getByRole("button", { name: E.backToThisMonth });
  await expect(back).toHaveCount(0); // already on this month

  await page.getByRole("button", { name: E.prevMonth }).click();
  await page.getByRole("button", { name: E.prevMonth }).click();
  await back.click();
  await expect.poll(() => asked.at(-1)).toBe(MONTH);
  await expect(back).toHaveCount(0);
});

test("a failed load says so and retries", async ({ page }) => {
  const asked = await stubMonth(page, 500);
  await openDashboard(page, "/dashboard/expenses");

  await expect(page.getByRole("alert").filter({ hasText: E.errorLoad })).toBeVisible();
  const before = asked.length; // dev's StrictMode runs the first load twice
  await page.getByRole("button", { name: E.retry }).click();
  await expect.poll(() => asked.length).toBe(before + 1);
});
