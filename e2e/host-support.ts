import { expect, test, type Page, type Request, type Route } from "@playwright/test";
import th from "../messages/th.json";

/**
 * Shared set-up for the host dashboard specs.
 *
 * Signing in: the specs reuse a saved Playwright storage state for a dedicated
 * test host, never a password in env (owners may have OTP on). Save one with
 *
 *   npm run e2e:host-login   (e2e/save-host-login.mjs; the app must be running)
 *
 * log in in the window it opens; it saves and checks the session by itself.
 * Then run with E2E_HOST_STATE=e2e/.auth/host.json and --workers=1: the phone
 * and desktop runs share one session. The file holds that login's session
 * cookies: it is gitignored, and expires like any session (save it again when
 * the specs land on /login).
 *
 * Like startSession (support.ts), nothing is written: reads pass, every write a
 * test has not stubbed is aborted and reported, and the test then fails.
 */

export const HOST_STATE = process.env.E2E_HOST_STATE;
export const T = th;

export function requireHost() {
  test.skip(!HOST_STATE, "Set E2E_HOST_STATE to a saved storage state of a test host (see e2e/host-support.ts).");
}

export interface HostSession {
  /** Writes the page made that no stub handled. Always empty in a passing test. */
  blockedWrites: string[];
  /** Bodies of the stubbed writes, in order, keyed "METHOD path". */
  writes: { key: string; body: unknown }[];
  /** Answer `METHOD <url regex>` instead of aborting it. */
  stubWrite: (method: string, url: RegExp, answer: (request: Request) => { status?: number; body?: unknown }) => Promise<void>;
}

const bodyOf = (request: Request): unknown => {
  try {
    return request.postDataJSON();
  } catch {
    return request.postData();
  }
};

export async function startHostSession(page: Page): Promise<HostSession> {
  const session: HostSession = {
    blockedWrites: [],
    writes: [],
    stubWrite: async (method, url, answer) => {
      await page.route(url, async (route) => {
        const request = route.request();
        if (request.method() !== method) return route.fallback();
        session.writes.push({ key: `${method} ${new URL(request.url()).pathname}`, body: bodyOf(request) });
        const { status = 200, body } = answer(request);
        return body === undefined
          ? route.fulfill({ status })
          : route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
      });
    },
  };

  // Registered first, so it runs last: stubs added later win.
  const guard = async (route: Route) => {
    const request = route.request();
    const method = request.method();
    const url = request.url();
    if (method === "GET" || method === "HEAD" || method === "OPTIONS") return route.fallback();
    // Not writes: keeping the session alive, CSP reports, and signing slip URLs.
    if (/\/auth\/v1\/token|\/api\/csp-report|\/api\/host\/booking-slips/.test(url)) return route.fallback();
    session.blockedWrites.push(`${method} ${url}`);
    return route.abort();
  };
  await page.route(/\/api\//, guard);
  await page.route(/supabase\.(co|in)\//, guard);
  // Hosts see the guest consent banner too; keep it out of the way.
  await page.context().addCookies([{ name: "cookie_consent", value: "declined", url: test.info().project.use.baseURL ?? "http://localhost:3000" }]);
  return session;
}

/** Goes to a dashboard page and fails clearly when the saved login has expired. */
export async function openDashboard(page: Page, path: string) {
  await page.goto(path);
  await expect(page, "the saved host login has expired: save e2e/.auth/host.json again").not.toHaveURL(/\/login/);
}

/** Follows a menu link: on phones the menu is a drawer behind the top-bar button. */
export async function clickNav(page: Page, href: string) {
  const menu = page.getByRole("button", { name: T.common.menu });
  if (await menu.isVisible()) await menu.click();
  await page.locator(`a[href="${href}"]:visible`).first().click();
}
