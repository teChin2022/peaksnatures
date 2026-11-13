import { expect, test, type BrowserContext, type Page, type Request, type Route } from "@playwright/test";
import th from "../messages/th.json";

/**
 * Shared set-up for the booking-flow specs.
 *
 * The page is read from the real database the app points at (a homestay chosen
 * with E2E_SLUG), but nothing is written: every API write is either stubbed
 * below or aborted and reported, and the test fails if one was aborted. Guests'
 * page views are not recorded either (CLAUDE.md: demand events write to that
 * database).
 *
 * Copy is read from messages/th.json so the specs keep working when wording
 * changes.
 */

export const SLUG = process.env.E2E_SLUG;
export const T = th;

export type HostMode = "normal" | "quick" | "both";

/** What Cloudflare's Turnstile script does in a test: answer at once, or be unreachable. */
export type TurnstileBehaviour = "pass" | "blocked";

// Stands in for challenges.cloudflare.com/turnstile/v0/api.js, which does not
// issue tokens to an automated browser. Same contract the widget library uses.
const FAKE_TURNSTILE = `
(function () {
  var named = document.currentScript && /[?&]onload=([^&]+)/.exec(document.currentScript.src);
  window.turnstile = {
    render: function (el, options) {
      window.__turnstileRendered = true;
      setTimeout(function () { if (options && options.callback) options.callback("e2e-token"); }, 50);
      return "widget-e2e";
    },
    reset: function () {}, remove: function () {}, execute: function () {},
    getResponse: function () { return "e2e-token"; }, isExpired: function () { return false; }
  };
  if (named && window[named[1]]) window[named[1]]();
})();
`;

export interface ApiCall {
  method: string;
  path: string;
  body: Record<string, unknown> | null;
}

export interface Session {
  /** Writes the page made that no stub handled. Always empty in a passing test. */
  blockedWrites: string[];
  /** Every stubbed API request, in order. */
  calls: ApiCall[];
  /** Replace the answer to `METHOD /path` for the rest of the test. */
  respond: (key: string, answer: { status?: number; body: unknown }) => void;
}

export const CREATED_ID = "3f2a9c1e-0000-4000-8000-123456789abc";

export function requireSlug() {
  test.skip(!SLUG, "Set E2E_SLUG to the slug of a homestay that has an available house.");
  return SLUG as string;
}

const json = (route: Route, body: unknown, status = 200) =>
  route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });

const bodyOf = (request: Request): Record<string, unknown> | null => {
  try {
    return request.postDataJSON();
  } catch {
    return null;
  }
};

/**
 * Prepares a page for a booking test. `mode` is the host's guest_booking_mode
 * the page should behave as: it is written into the page's own payload, so the
 * database is not touched and the host does not have to be set up. `holdMs` is
 * how long the stubbed room hold lasts.
 */
export async function startSession(
  page: Page,
  context: BrowserContext,
  options: { mode?: HostMode; holdMs?: number; turnstile?: TurnstileBehaviour } = {},
): Promise<Session> {
  const { mode, holdMs = 10 * 60_000, turnstile = "pass" } = options;
  const origin = new URL(page.context().browser() ? (process.env.E2E_BASE_URL ?? "http://localhost:3000") : "http://localhost:3000").origin;

  await context.addCookies([
    { name: "cookie_consent", value: "declined", url: origin },
    { name: "locale", value: "th", url: origin },
  ]);
  await page.addInitScript(() => {
    navigator.sendBeacon = () => true;
  });

  const session: Session = {
    blockedWrites: [],
    calls: [],
    respond: (key, answer) => {
      overrides.set(key, answer);
    },
  };
  const overrides = new Map<string, { status?: number; body: unknown }>();

  // Registered first, so it runs last: anything below that does not handle a
  // request falls through to here. Reads pass; writes are aborted and counted.
  const guard = async (route: Route) => {
    const method = route.request().method();
    if (method === "GET" || method === "HEAD") return route.fallback();
    session.blockedWrites.push(`${method} ${route.request().url()}`);
    return route.abort();
  };
  await page.route(/\/api\//, guard);
  await page.route(/supabase\.(co|in)\//, guard);

  const stub = async (route: Route, defaults: (request: Request) => { status?: number; body: unknown }, key?: string) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    session.calls.push({ method: request.method(), path, body: bodyOf(request) });
    const answer = overrides.get(key ?? `${request.method()} ${path}`) ?? defaults(request);
    return json(route, answer.body, answer.status ?? 200);
  };

  await page.route("https://challenges.cloudflare.com/**", (route) =>
    turnstile === "blocked"
      ? route.abort()
      : route.fulfill({ status: 200, contentType: "application/javascript", body: FAKE_TURNSTILE }),
  );
  await page.route("**/api/demand*", (route) => route.fulfill({ status: 204 }));
  // The browser reports Content-Security-Policy violations on its own (the dev
  // server's scripts trip script-src); that is not the app writing anything.
  await page.route("**/api/csp-report", (route) => route.fulfill({ status: 204 }));
  await page.route("**/api/bookings/hold", (route) =>
    stub(route, (r) =>
      r.method() === "POST"
        ? { body: { hold_id: "hold-e2e", expires_at: new Date(Date.now() + holdMs).toISOString() } }
        : { body: { released: true } },
    ),
  );
  await page.route("**/api/bookings/draft", (route) => stub(route, () => ({ body: {} })));
  await page.route("**/api/verify-slip", (route) =>
    stub(route, () => ({
      body: { verified: true, slip_hash: "hash-e2e", slip_trans_ref: "TR-E2E", payment_slip_url: "pending/e2e/slip.jpg", easyslip_response: { ok: true } },
    })),
  );
  await page.route("**/api/bookings", (route) =>
    route.request().method() === "POST"
      ? stub(route, () => ({ status: 201, body: { booking: { id: CREATED_ID } } }))
      : route.fallback(),
  );
  // A price preview (body.preview) writes nothing; override it as "PREVIEW /api/bookings/change-dates".
  await page.route("**/api/bookings/change-dates", (route) => {
    const preview = bodyOf(route.request())?.preview === true;
    return preview
      ? stub(route, () => ({ body: CHANGE_PREVIEW_SAME_PRICE }), "PREVIEW /api/bookings/change-dates")
      : stub(route, () => ({ status: 201, body: { success: true, request: { id: "dcr-e2e" }, price_difference: 0, new_total_price: 3000 } }));
  });
  await page.route("**/api/bookings/group", (route) =>
    stub(route, () => ({ status: 201, body: { group: { id: CREATED_ID }, bookings: [{ id: "member-e2e" }] } })),
  );

  if (mode) {
    // The booking page is server-rendered; its client props travel in the HTML
    // as escaped JSON. Only the document is rewritten.
    await page.route(/\/book(\?.*)?$/, async (route) => {
      if (route.request().resourceType() !== "document") return route.fallback();
      const response = await route.fetch();
      let html = await response.text();
      let replaced = 0;
      html = html.replace(/(guest_booking_mode\\*"\s*:\s*\\*")([^"\\]*)(\\*")/g, (_m, a: string, _old: string, b: string) => {
        replaced += 1;
        return `${a}${mode}${b}`;
      });
      expect(replaced, "the host mode was not found in the page payload; has the Next.js payload format changed?").toBeGreaterThan(0);
      return route.fulfill({ response, body: html });
    });
  }

  return session;
}

/** Opens /{slug}/book and works through the date picker, a house, the cart and the guest details to the payment step. */
export async function reachPayment(page: Page, slug: string, options: { houses?: number; province?: boolean } = {}) {
  const { houses = 1, province = true } = options;
  await page.goto(`/${slug}/book`);
  await expect(page.getByRole("button", { name: T.booking.selectDates }).first()).toBeVisible();

  await chooseDates(page);
  await addHouses(page, houses);

  const card = page.locator("section").filter({ has: page.getByRole("button", { name: T.booking.continueDetails }) });
  await card.getByRole("checkbox").check();
  await page.getByRole("button", { name: T.booking.continueDetails }).click();

  await page.locator("#bk-name").fill("ทดสอบ ระบบ");
  await page.locator("#bk-email").fill("e2e@example.com");
  await page.locator("#bk-phone").fill("0898765432");
  if (province) {
    await page.locator("#bk-province").click();
    await page.getByRole("option").first().click();
  }

  await page.getByRole("button", { name: T.booking.continuePayment }).click();
  await page.getByRole("button", { name: T.booking.confirmProceed }).click();
  await expect(page.getByRole("heading", { name: T.booking.paymentTitle })).toBeVisible();
}

/** Picks two consecutive free nights some days ahead, trying later pairs when a house is not free for them. */
async function chooseDates(page: Page) {
  for (let attempt = 0; attempt < 10; attempt += 1) {
    await page.getByRole("button", { name: T.booking.selectDates }).last().click();
    const dialog = page.getByRole("dialog");
    const days = dialog.locator("button[data-day]");
    await expect(days.first()).toBeVisible();
    const total = await days.count();

    const free: number[] = [];
    for (let i = 0; i < total - 1; i += 1) {
      const [a, b] = await Promise.all([days.nth(i).isEnabled(), days.nth(i + 1).isEnabled()]);
      if (a && b) free.push(i);
    }
    const pick = free[Math.min(4 + attempt * 3, free.length - 1)];
    await days.nth(pick).click();
    await days.nth(pick + 1).click();
    await dialog.getByRole("button", { name: T.common.done }).click();

    const available = page.getByRole("button", { name: T.rooms.selectThisRoom }).filter({ hasNot: page.locator("[disabled]") });
    try {
      await expect(available.first()).toBeEnabled({ timeout: 4000 });
      return;
    } catch {
      // No house free for those nights: try another pair.
    }
  }
  throw new Error("No two consecutive free nights with an available house were found.");
}

async function addHouses(page: Page, count: number) {
  for (let i = 0; i < count; i += 1) {
    const choose = page.getByRole("button", { name: T.rooms.selectThisRoom, disabled: false });
    test.skip((await choose.count()) <= i, `needs ${count} houses free for the chosen dates`);
    await choose.nth(i).click();
    const dialog = page.getByRole("dialog");
    const add = dialog.getByRole("button", { name: T.booking.addToCart });
    // A house priced by guest group cannot be added until one group is chosen.
    if (await add.isDisabled()) await dialog.getByRole("button", { name: /฿/ }).first().click();
    await add.click();
    await expect(page.getByRole("dialog")).toBeHidden();
  }
}

export function expectNoUnexpectedWrites(session: Session) {
  expect(session.blockedWrites, "a request wrote to the API without a stub").toEqual([]);
}

export const bookingPosts = (session: Session) =>
  session.calls.filter((c) => c.method === "POST" && (c.path === "/api/bookings" || c.path === "/api/bookings/group"));

/* ---------- /{slug}/change-booking ---------- */

/** What the change-dates preview answers when the new stay costs what the booking cost. */
export const CHANGE_PREVIEW_SAME_PRICE = {
  preview: true, new_total_price: 3000, old_total_price: 3000, price_difference: 0, additional_payment: 0,
  amount_paid: 3000, payment_type: "full", deposit_available: false, new_deposit: 0, full_outstanding: 0,
};

export const CHANGE = {
  facebook: "https://www.facebook.com/e2e.homestay",
  phone: "0812345678",
  bookingId: "b0000000-0000-4000-8000-00000000e2e0",
  houses: [
    { id: "house-a", name: "บ้านริมธาร" },
    { id: "house-b", name: "บ้านบนเนิน" },
  ],
};

const isoDaysAhead = (days: number) => new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10);

/** Writes `value` over a string-or-null prop in the server-rendered payload. */
function rewriteProp(html: string, prop: string, value: string) {
  let replaced = 0;
  const out = html.replace(new RegExp(`(${prop}(\\\\*)"\\s*:\\s*)(?:null|\\\\*"[^"\\\\]*\\\\*")`, "g"), (_m, head: string, esc: string) => {
    replaced += 1;
    return `${head}${esc}"${value}${esc}"`;
  });
  expect(replaced, `${prop} was not found in the page payload; has the Next.js payload format changed?`).toBeGreaterThan(0);
  return out;
}

/** The booking the change-booking search finds: confirmed, paid in full, 40 days out. */
export function stubbedBooking(overrides: Record<string, unknown> = {}) {
  return {
    id: CHANGE.bookingId, guest_name: "ทดสอบ ระบบ", guest_email: "e2e@example.com", guest_phone: "0898765432",
    check_in: isoDaysAhead(40), check_out: isoDaysAhead(42), num_guests: 2, total_price: 3000, amount_paid: 3000,
    payment_type: "full", status: "confirmed", room_id: CHANGE.houses[0].id, group_id: null, room_name: CHANGE.houses[0].name,
    checked_in_at: null, checked_out_at: null, created_at: new Date().toISOString(), selected_options: null,
    has_review: false, pending_date_change: null,
    ...overrides,
  };
}

/**
 * Stubs what the change-booking page reads about one booking: the search
 * result, the houses, availability and blocked nights. The host's Facebook
 * link and phone are written into the page's own payload. Call after
 * startSession, which stubs the change request itself.
 */
export async function stubChangeBooking(page: Page) {
  await page.route(/\/change-booking(\?.*)?$/, async (route) => {
    if (route.request().resourceType() !== "document") return route.fallback();
    const response = await route.fetch();
    let html = await response.text();
    html = rewriteProp(html, "facebookUrl", CHANGE.facebook);
    html = rewriteProp(html, "hostPhone", CHANGE.phone);
    return route.fulfill({ response, body: html });
  });
  await page.route("**/api/bookings/search*", (route) => json(route, { bookings: [stubbedBooking()] }));
  await page.route("**/api/bookings/availability*", (route) => json(route, { bookedRanges: [] }));
  // The form reads houses and blocked nights straight from Supabase.
  await page.route(/\/rest\/v1\/rooms\?/, (route) =>
    json(route, route.request().url().includes("quantity") ? { quantity: 1 } : CHANGE.houses),
  );
  await page.route(/\/rest\/v1\/blocked_dates\?/, (route) => json(route, []));
}

/** Opens /{slug}/change-booking and finds the stubbed booking. */
export async function findBooking(page: Page, slug: string) {
  await page.goto(`/${slug}/change-booking`);
  const search = page.getByPlaceholder(T.bookingSearch.placeholder);
  await expect(search).toBeEnabled();
  await search.fill(CHANGE.bookingId.slice(0, 8));
  await page.getByRole("button", { name: T.bookingSearch.search, exact: true }).click();
  await expect(page.getByRole("button", { name: T.bookingSearch.changeDates })).toBeVisible();
}

/** Picks a two-night stay next month, where every day is in the future. */
export async function chooseNewStay(page: Page) {
  await page.locator("nav button").last().click();
  const days = page.locator("button[data-day]:not([disabled])");
  await expect(days.nth(10)).toBeVisible();
  await days.nth(8).click();
  await days.nth(10).click();
}
