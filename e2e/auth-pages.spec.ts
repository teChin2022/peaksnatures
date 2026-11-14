import { expect, test } from "@playwright/test";
import { T, expectNoUnexpectedWrites, startSession, type Session } from "./support";

/**
 * The host auth pages are in the brand and have structure (ui-audit A1, A2,
 * S14, S18): one <h1> inside <main>, a Thai <title>, named password toggles.
 * Pages are only opened, never submitted; startSession aborts any write.
 */

let session: Session;

test.afterEach(() => {
  if (session) expectNoUnexpectedWrites(session);
});

const PAGES = [
  { path: "/login", heading: T.auth.signIn, title: T.auth.signIn },
  { path: "/register", heading: T.auth.register, title: T.auth.registerAs },
  { path: "/forgot-password", heading: T.auth.forgotPasswordTitle, title: T.auth.forgotPasswordTitle },
];

for (const { path, heading, title } of PAGES) {
  test(`${path} has one h1 in main and a Thai title`, async ({ page, context }) => {
    session = await startSession(page, context);
    await page.goto(path);

    const main = page.getByRole("main");
    await expect(main).toHaveCount(1);
    await expect(main.getByRole("heading", { level: 1 })).toHaveText(heading);
    await expect(page.getByRole("heading", { level: 1 })).toHaveCount(1);
    await expect(page).toHaveTitle(new RegExp(title));
  });
}

test("the password toggle on /login says what it does", async ({ page, context }) => {
  session = await startSession(page, context);
  await page.goto("/login");
  const toggle = page.getByRole("button", { name: T.auth.showPassword });
  await expect(toggle).toBeAttached();
  await toggle.click();
  await expect(page.getByRole("button", { name: T.auth.hidePassword })).toBeAttached();
});
