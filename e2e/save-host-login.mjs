// Saves a host login for the host dashboard specs (e2e/host-support.ts).
//
//   npm run e2e:host-login
//
// Opens Chrome on /login. Log in there (OTP included: paste a code or link into
// that window, not your usual browser). On reaching /dashboard the login is
// saved and checked in a fresh browser, and the window closes by itself.
// Needs the app running (npm run dev). Sign-out is local to the browser it is
// pressed in, so logging out elsewhere no longer ends the saved session.
import { chromium } from "@playwright/test";

const baseURL = process.env.E2E_BASE_URL ?? "http://localhost:3000";
const out = process.env.E2E_HOST_STATE ?? "e2e/.auth/host.json";

try {
  await fetch(`${baseURL}/login`);
} catch {
  console.error(`Nothing answers at ${baseURL}. Start the app first: npm run dev`);
  process.exit(1);
}

const browser = await chromium.launch({ channel: "chrome", headless: false });
try {
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto(`${baseURL}/login`);
  console.log("Log in in the Chrome window that just opened (15 minutes).");
  await page.waitForURL(/\/dashboard(\/|\?|$)/, { timeout: 15 * 60_000 });
  await page.waitForLoadState("networkidle").catch(() => {});
  await context.storageState({ path: out });

  // The specs only get a usable session if a fresh browser gets past /login with it.
  const check = await browser.newContext({ storageState: out });
  const probe = await check.newPage();
  await probe.goto(`${baseURL}/dashboard`);
  if (/\/login/.test(probe.url())) {
    console.error(`Saved ${out}, but it does not log in on its own. Run this again.`);
    process.exitCode = 1;
  } else {
    console.log(`Saved and checked ${out}. Run: E2E_HOST_STATE=${out} npx playwright test host-dashboard --workers=1`);
  }
} finally {
  await browser.close();
}
