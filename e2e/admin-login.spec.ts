import { expect, test, type Page } from "@playwright/test";
import en from "../messages/en.json";
import { T, expectNoUnexpectedWrites, startSession, type Session } from "./support";

/**
 * /admin/login, English-only (the admin pages are), with the site locale left
 * on Thai by startSession. Every auth call is stubbed per test; anything else
 * that writes is aborted and fails the test. The page's own copy is English
 * literals in page.tsx (no message file); the OTP dialog's comes from en.json.
 */

let session: Session;

test.afterEach(() => {
  if (session) expectNoUnexpectedWrites(session);
});

type Answer = { status: number; body: unknown; headers?: Record<string, string> };

/** Stubs one auth endpoint with answers served in order (the last one repeats); returns the bodies it received. */
async function stubApi(page: Page, path: string, ...answers: Answer[]) {
  const bodies: unknown[] = [];
  await page.route(`**${path}`, (route) => {
    bodies.push(route.request().postDataJSON());
    const a = answers.length > 1 ? answers.shift()! : answers[0];
    return route.fulfill({ status: a.status, contentType: "application/json", headers: a.headers, body: JSON.stringify(a.body) });
  });
  return bodies;
}

async function signIn(page: Page) {
  // Sign In stays pressable while Turnstile runs, so wait for the fake widget's token.
  await page.waitForFunction(() => (window as { __turnstilePassed?: boolean }).__turnstilePassed === true);
  await page.getByLabel("Email").fill("admin@example.com");
  await page.getByLabel("Password", { exact: true }).fill("not-a-real-password");
  await page.getByRole("button", { name: "Sign In" }).click();
}

const otpDialog = (page: Page) => page.getByRole("dialog", { name: en.auth.otpTitle });

async function typeCode(page: Page) {
  // Focus starts on the first digit; each digit moves it on, the sixth submits.
  await expect(page.getByRole("textbox", { name: "Digit 1 of 6" })).toBeFocused();
  await page.keyboard.type("123456");
}

test("is an English page with one h1, a branded title and no cookie notice", async ({ page, context }) => {
  session = await startSession(page, context);
  await context.clearCookies({ name: "cookie_consent" });
  await page.goto("/admin/login");

  const main = page.getByRole("main");
  await expect(main).toHaveAttribute("lang", "en");
  await expect(main.getByRole("heading", { level: 1 })).toHaveText("Platform Admin");
  await expect(page.getByRole("heading", { level: 1 })).toHaveCount(1);
  await expect(page).toHaveTitle("Admin Login | Peaksnature");
  // The notice follows the site locale (Thai here); guests still get it, staff on /admin never do.
  await expect(page.getByText(T.cookie.title)).toHaveCount(0);
});

test("the show-password toggle is reachable by keyboard", async ({ page, context }) => {
  session = await startSession(page, context);
  await page.goto("/admin/login");
  await page.getByLabel("Email").focus();
  await page.keyboard.press("Tab");
  await page.keyboard.press("Tab");
  const toggle = page.getByRole("button", { name: "Show password" });
  await expect(toggle).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("button", { name: "Hide password" })).toBeFocused();
  await expect(page.getByLabel("Password", { exact: true })).toHaveAttribute("type", "text");
});

test("a rate limit on sign-in says how long to wait", async ({ page, context }) => {
  session = await startSession(page, context);
  await stubApi(page, "/api/auth/send-otp", {
    status: 429,
    headers: { "Retry-After": "120" },
    body: { error: "Too many requests. Please try again later." },
  });
  await page.goto("/admin/login");
  await signIn(page);
  await expect(page.getByRole("main").getByRole("alert")).toHaveText("Too many attempts. Try again in 2 minutes.");
  await expect(otpDialog(page)).toHaveCount(0);
});

test("Sign In says what it waits for while the security check runs", async ({ page, context }) => {
  session = await startSession(page, context);
  // Cloudflare never answers: the widget neither passes nor errors, so there is no token.
  await page.route("https://challenges.cloudflare.com/**", () => {});
  await page.goto("/admin/login");
  await page.getByLabel("Email").fill("admin@example.com");
  await page.getByLabel("Password", { exact: true }).fill("not-a-real-password");
  await page.getByLabel("Password", { exact: true }).press("Enter");
  await expect(page.getByRole("main").getByRole("alert")).toHaveText(
    "Wait for the security check below to finish, then sign in.",
  );
});

test("the code step is an English dialog that Escape closes", async ({ page, context }) => {
  session = await startSession(page, context);
  const sent = await stubApi(page, "/api/auth/send-otp", { status: 200, body: { success: true } });
  await page.goto("/admin/login");
  await signIn(page);

  const dialog = otpDialog(page);
  await expect(dialog).toBeVisible();
  // Portalled outside <main lang="en">, so it carries its own lang.
  await expect(dialog).toHaveAttribute("lang", "en");
  await expect(dialog.getByRole("button", { name: en.common.close })).toBeAttached();
  expect(sent).toEqual([expect.objectContaining({ email: "admin@example.com", source: "admin" })]);

  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  // Focus comes back to where the user left off, not to <body>.
  await expect(page.getByRole("button", { name: "Sign In" })).toBeFocused();
});

test("a wrong code is announced in the dialog", async ({ page, context }) => {
  session = await startSession(page, context);
  await stubApi(page, "/api/auth/send-otp", { status: 200, body: { success: true } });
  const verified = await stubApi(page, "/api/auth/verify-otp", { status: 401, body: { error: "invalid_code" } });
  await page.goto("/admin/login");
  await signIn(page);
  await typeCode(page);

  await expect(otpDialog(page).getByRole("alert")).toHaveText("Invalid verification code.");
  expect(verified).toEqual([expect.objectContaining({ otp: "123456" })]);
  // The refused code is cleared and the next one can be typed straight in.
  await expect(page.getByRole("textbox", { name: "Digit 1 of 6" })).toHaveValue("");
  await expect(page.getByRole("textbox", { name: "Digit 1 of 6" })).toBeFocused();
});

test("an account that is not an admin is signed out and told so", async ({ page, context }) => {
  session = await startSession(page, context);
  await stubApi(page, "/api/auth/send-otp", { status: 200, body: { success: true } });
  await stubApi(page, "/api/auth/verify-otp", { status: 200, body: { success: true } });
  const checked = await stubApi(page, "/api/admin/auth/verify", { status: 403, body: { error: "Not a platform admin" } });
  await page.goto("/admin/login");
  await signIn(page);
  await typeCode(page);

  await expect(otpDialog(page).getByRole("alert")).toHaveText(
    "This account isn't a platform admin. You've been signed out.",
  );
  expect(checked).toHaveLength(1);
  await expect(page).toHaveURL(/\/admin\/login$/);
});
