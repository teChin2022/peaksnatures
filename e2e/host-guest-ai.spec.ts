import { expect, test, type Page } from "@playwright/test";
import { HOST_STATE, T, clickNav, openDashboard, requireHost, startHostSession, type HostSession } from "./host-support";

/**
 * The guest AI assistant page (/dashboard/ai-admin, owner only, migration 084):
 * asking for it, and the settings once approved. The page's one read is
 * stubbed, so it works before 084 is applied; so are the writes.
 *
 *   E2E_HOST_STATE=e2e/.auth/host.json npx playwright test host-guest-ai --workers=1
 */

test.use({ storageState: HOST_STATE });

const G = T.guestAi;
const APPROVED = {
  host_id: "host-1",
  status: "approved",
  requested_at: "2026-11-19T03:00:00Z",
  decided_at: "2026-11-19T04:00:00Z",
  enabled: false,
  can_answer: true,
  can_set_dates: true,
  can_suggest_houses: true,
  can_navigate: true,
  instructions: null,
  daily_reply_cap: 50,
};

let session: HostSession | undefined;

async function stubSettings(page: Page, settings: unknown) {
  await page.route(/\/api\/host\/ai-admin$/, (route) =>
    route.request().method() === "GET"
      ? route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ settings }) })
      : route.fallback(),
  );
}

test.beforeEach(async ({ page }) => {
  requireHost();
  session = await startHostSession(page);
});

test.afterEach(() => {
  if (!session) return; // skipped before it started (no saved login)
  expect(session.blockedWrites, "a write reached the network without a stub").toEqual([]);
  session = undefined;
});

test("the owner's menu opens the page, and a first request turns into a wait", async ({ page }, testInfo) => {
  await stubSettings(page, null);
  await session!.stubWrite("POST", /\/api\/host\/ai-admin$/, () => ({
    status: 201,
    body: { settings: { ...APPROVED, status: "requested", decided_at: null } },
  }));
  await openDashboard(page, "/dashboard");
  await clickNav(page, "/dashboard/ai-admin");
  await expect(page).toHaveURL(/\/dashboard\/ai-admin$/);

  await expect(page.getByRole("heading", { name: G.title })).toBeVisible();
  await expect(page.getByText(G.noneTitle)).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("none.png"), fullPage: true });

  await page.getByRole("button", { name: G.request }).click();
  await expect(page.getByText(G.requestedTitle)).toBeVisible();
  expect(session!.writes).toEqual([{ key: "POST /api/host/ai-admin", body: null }]);
  await page.screenshot({ path: testInfo.outputPath("requested.png"), fullPage: true });
});

test("approved: switches save at once, the notes on Save, and the cap is shown", async ({ page }, testInfo) => {
  await stubSettings(page, APPROVED);
  await session!.stubWrite("PATCH", /\/api\/host\/ai-admin$/, (request) => ({
    body: { settings: { ...APPROVED, ...(request.postDataJSON() as object) } },
  }));
  await openDashboard(page, "/dashboard/ai-admin");

  await expect(page.getByText(G.capLine.replace("{cap}", "50"))).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("approved.png"), fullPage: true });

  const show = page.getByRole("switch", { name: G.enabledLabel });
  await expect(show).not.toBeChecked();
  // The whole row is the label: tapping the text turns it on.
  await page.getByText(G.enabledLabel).click();
  await expect(show).toBeChecked();
  await expect(page.getByText(G.enabledOn)).toBeVisible();

  await page.getByRole("switch", { name: G.canSuggestHouses }).click();
  await expect(page.getByRole("switch", { name: G.canSuggestHouses })).not.toBeChecked();

  const save = page.getByRole("button", { name: G.save });
  await expect(save).toBeDisabled();
  await page.getByLabel(G.instructionsLabel).fill("  จอดรถได้ 3 คันหน้าบ้าน  ");
  await save.click();
  await expect(page.getByText(G.saved)).toBeVisible();

  expect(session!.writes).toEqual([
    { key: "PATCH /api/host/ai-admin", body: { enabled: true } },
    { key: "PATCH /api/host/ai-admin", body: { can_suggest_houses: false } },
    { key: "PATCH /api/host/ai-admin", body: { instructions: "จอดรถได้ 3 คันหน้าบ้าน" } },
  ]);
});

test("suspended: an explanation and no settings", async ({ page }, testInfo) => {
  await stubSettings(page, { ...APPROVED, status: "suspended" });
  await openDashboard(page, "/dashboard/ai-admin");
  await expect(page.getByText(G.suspendedTitle)).toBeVisible();
  await expect(page.getByRole("switch")).toHaveCount(0);
  await page.screenshot({ path: testInfo.outputPath("suspended.png"), fullPage: true });
});
