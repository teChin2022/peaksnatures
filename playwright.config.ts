import { defineConfig } from "@playwright/test";

/**
 * Browser tests for the guest booking flow (e2e/).
 *
 *   E2E_SLUG=<homestay slug> npm run test:e2e
 *
 * They read the homestay from whatever Supabase project the app is pointed at,
 * and they never write to it: e2e/support.ts aborts any API write that a test
 * has not stubbed. They use the Chrome installed on the machine, so no browser
 * is downloaded. Set E2E_BASE_URL to test a deployed preview instead of
 * starting `npm run dev`.
 */
const baseURL = process.env.E2E_BASE_URL ?? "http://localhost:3000";

export default defineConfig({
  testDir: "./e2e",
  timeout: 60_000,
  expect: { timeout: 10_000 },
  // One worker: the dev server compiles each route on first use, and parallel
  // first visits only make it slower and flakier.
  workers: 1,
  reporter: [["list"]],
  outputDir: "./test-results",
  use: {
    baseURL,
    channel: "chrome",
    locale: "th-TH",
    timezoneId: "Asia/Bangkok",
    trace: "retain-on-failure",
  },
  projects: [
    {
      name: "phone",
      use: { viewport: { width: 375, height: 812 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 },
    },
    { name: "desktop", use: { viewport: { width: 1280, height: 800 } } },
  ],
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : { command: "npm run dev", url: baseURL, reuseExistingServer: true, timeout: 120_000 },
});
