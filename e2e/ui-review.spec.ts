import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { test, type Page, type TestInfo } from "@playwright/test";
import { expectNoUnexpectedWrites, reachPayment, requireSlug, startSession, type Session } from "./support";

/**
 * Evidence for a UI review (peaksnature-ui Mode A), not a regression test.
 *
 *   UI_REVIEW=1 E2E_SLUG=<slug> npx playwright test ui-review
 *
 * For each state it saves a full-page screenshot and runs Impeccable's
 * detector against the same live page over CDP, so contrast and tiny-text are
 * read from the real render at the real width. Output goes to
 * .impeccable/review/ui-review-<stamp>/ (gitignored). The page is guarded by
 * startSession like the booking specs: nothing is written to the database.
 * Findings never fail the run; an unstubbed write does.
 */

test.skip(!process.env.UI_REVIEW, "Set UI_REVIEW=1 to capture UI review evidence.");

const DETECT = ".claude/skills/impeccable/scripts/impeccable";
const PORTS: Record<string, number> = { phone: 9333, desktop: 9334 };
const OUT = join(".impeccable", "review", `ui-review-${process.env.UI_REVIEW_STAMP ?? new Date().toISOString().slice(0, 16).replace(/[:T]/g, "-")}`);

// The detector attaches to this browser's DevTools port while the test still
// holds the viewport emulation (it is dropped when the CDP client disconnects).
test.use({
  launchOptions: [
    async ({}, use, workerInfo) => {
      await use({ args: [`--remote-debugging-port=${PORTS[workerInfo.project.name] ?? 9335}`] });
    },
    { scope: "worker" },
  ],
});

let session: Session;

test.afterEach(() => {
  if (session) expectNoUnexpectedWrites(session);
});

/** Scrolls through the page so `whileInView` sections render before the capture. */
async function revealAll(page: Page) {
  await page.evaluate(async () => {
    for (let y = 0; y < document.body.scrollHeight; y += window.innerHeight / 2) {
      window.scrollTo(0, y);
      await new Promise((r) => setTimeout(r, 150));
    }
    window.scrollTo(0, 0);
  });
  await page.waitForTimeout(800);
}

async function capture(page: Page, testInfo: TestInfo, state: string, slug: string) {
  const width = page.viewportSize()?.width ?? 0;
  const name = `${state}-${width}`;
  mkdirSync(OUT, { recursive: true });
  // Hide the Next dev overlay: it sits on the header's menu button.
  await page.addStyleTag({ content: "nextjs-portal{display:none!important}" });
  await page.screenshot({ path: join(OUT, `${name}.png`), fullPage: true });

  if (!existsSync(DETECT)) {
    writeFileSync(join(OUT, `${name}.detect.json`), JSON.stringify({ error: "detector not installed" }));
    return;
  }
  const port = String(PORTS[testInfo.project.name] ?? 9335);
  let out: string;
  try {
    out = execFileSync(DETECT, ["detect", "--cdp", port, "--target", slug, "--json"], { encoding: "utf8" });
  } catch (error) {
    // Exit 2 means the scan finished with findings; anything else is a failed scan.
    const e = error as { status?: number; stdout?: string; stderr?: string };
    out = e.status === 2 && e.stdout ? e.stdout : JSON.stringify({ error: `detect exit ${e.status}`, stderr: e.stderr });
  }
  writeFileSync(join(OUT, `${name}.detect.json`), out);
}

/** The desktop project also covers the tablet width; the phone project keeps its touch emulation. */
const widthsFor = (testInfo: TestInfo) => (testInfo.project.name === "desktop" ? [1280, 768] : [null]);

test("landing page", async ({ page, context }, testInfo) => {
  const slug = requireSlug();
  session = await startSession(page, context);
  for (const width of widthsFor(testInfo)) {
    if (width) await page.setViewportSize({ width, height: 800 });
    await page.goto(`/${slug}`);
    await revealAll(page);
    await capture(page, testInfo, "landing", slug);
  }
});

test("booking page, first view", async ({ page, context }, testInfo) => {
  const slug = requireSlug();
  session = await startSession(page, context);
  for (const width of widthsFor(testInfo)) {
    if (width) await page.setViewportSize({ width, height: 800 });
    await page.goto(`/${slug}/book`);
    await page.waitForLoadState("networkidle");
    await capture(page, testInfo, "book", slug);
  }
});

test("booking page, payment step", async ({ page, context }, testInfo) => {
  const slug = requireSlug();
  // Holds and the draft are stubbed by startSession; nothing reaches the database.
  session = await startSession(page, context, { mode: "normal" });
  for (const width of widthsFor(testInfo)) {
    if (width) await page.setViewportSize({ width, height: 800 });
    await reachPayment(page, slug);
    await capture(page, testInfo, "payment", slug);
  }
});
