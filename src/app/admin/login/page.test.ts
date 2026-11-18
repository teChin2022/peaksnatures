// @vitest-environment happy-dom
import { act, createElement, useEffect } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  push: vi.fn(),
  refresh: vi.fn(),
  signOut: vi.fn(),
}));
// null: the widget is still checking and has handed over no token yet.
const turnstile = vi.hoisted(() => ({ token: "token" as string | null }));

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: h.push, refresh: h.refresh }) }));
vi.mock("next/image", () => ({ default: (props: { alt: string }) => createElement("img", { alt: props.alt }) }));
vi.mock("@/lib/supabase/client", () => ({ createClient: () => ({ auth: { signOut: h.signOut } }) }));
// Turnstile hands over a token at once, unless a test sets turnstile.token to null.
vi.mock("@marsidev/react-turnstile", () => ({
  Turnstile: ({ onSuccess }: { onSuccess: (t: string) => void }) => {
    useEffect(() => {
      if (turnstile.token) onSuccess(turnstile.token);
    }, [onSuccess]);
    return null;
  },
}));
// The modal's own markup is not under test here: two buttons drive the page's callbacks.
vi.mock("@/components/otp-modal", () => ({
  default: ({ onVerify, onResend, error }: { onVerify: (c: string) => void; onResend: () => void; error: string | null }) =>
    createElement(
      "div",
      { "data-testid": "otp" },
      createElement("button", { type: "button", onClick: () => onVerify("123456") }, "verify"),
      createElement("button", { type: "button", onClick: () => onResend() }, "resend"),
      error && createElement("p", { "data-testid": "otp-error" }, error),
    ),
}));

import AdminLoginPage from "./page";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

type Reply = { status: number; body?: unknown; headers?: Record<string, string> };

let container: HTMLDivElement;
let root: Root;
let replies: Record<string, Reply[]>;

function reply(url: string, ...r: Reply[]) {
  replies[url] = r;
}

beforeEach(() => {
  replies = {};
  turnstile.token = "token";
  h.push.mockReset();
  h.refresh.mockReset();
  h.signOut.mockReset().mockResolvedValue({ error: null });
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      const r = replies[url]?.shift();
      if (!r) throw new Error(`unexpected fetch ${url}`);
      return new Response(JSON.stringify(r.body ?? {}), { status: r.status, headers: r.headers });
    }),
  );
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

const setValue = (el: HTMLInputElement, value: string) => {
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(el, value);
  el.dispatchEvent(new Event("input", { bubbles: true }));
};

const button = (text: string) => {
  const b = [...container.querySelectorAll("button")].find((x) => x.textContent?.trim() === text);
  if (!b) throw new Error(`button ${text} not found`);
  return b;
};

async function signIn() {
  await act(async () => root.render(createElement(AdminLoginPage)));
  await act(async () => {
    setValue(container.querySelector<HTMLInputElement>("#email")!, "admin@example.com");
    setValue(container.querySelector<HTMLInputElement>("#password")!, "secret-pass");
  });
  await act(async () => container.querySelector("form")!.requestSubmit());
}

const click = async (text: string) => act(async () => button(text).click());
const otpError = () => container.querySelector('[data-testid="otp-error"]')?.textContent;

it("marks the page as English for screen readers", async () => {
  await act(async () => root.render(createElement(AdminLoginPage)));
  expect(container.querySelector("main")?.getAttribute("lang")).toBe("en");
});

it("lets a keyboard reach the show-password toggle", async () => {
  await act(async () => root.render(createElement(AdminLoginPage)));
  expect(button("").getAttribute("aria-label")).toBe("Show password");
  expect(button("").tabIndex).toBe(0);
});

describe("before anything is sent", () => {
  it("says what it is waiting for instead of greying out Sign In while the security check runs", async () => {
    turnstile.token = null;
    await act(async () => root.render(createElement(AdminLoginPage)));
    expect(button("Sign In").disabled).toBe(false);
    await act(async () => {
      setValue(container.querySelector<HTMLInputElement>("#email")!, "admin@example.com");
      setValue(container.querySelector<HTMLInputElement>("#password")!, "secret-pass");
    });
    await act(async () => container.querySelector("form")!.requestSubmit());
    expect(container.querySelector('[role="alert"]')?.textContent).toBe(
      "Wait for the security check below to finish, then sign in.",
    );
    expect(fetch).not.toHaveBeenCalled();
  });

  it("checks the fields itself, in English, rather than through the browser's bubble", async () => {
    await act(async () => root.render(createElement(AdminLoginPage)));
    expect(container.querySelector("form")!.noValidate).toBe(true);
    await act(async () => setValue(container.querySelector<HTMLInputElement>("#email")!, "admin@example.com"));
    await act(async () => container.querySelector("form")!.requestSubmit());
    expect(container.querySelector('[role="alert"]')?.textContent).toBe("Enter your password");
    expect(fetch).not.toHaveBeenCalled();
  });

  it("ties a field's error to that field and moves focus there", async () => {
    await act(async () => root.render(createElement(AdminLoginPage)));
    const email = container.querySelector<HTMLInputElement>("#email")!;
    await act(async () => setValue(email, "not-an-email"));
    await act(async () => container.querySelector("form")!.requestSubmit());

    expect(email.getAttribute("aria-invalid")).toBe("true");
    const message = document.getElementById(email.getAttribute("aria-describedby") ?? "");
    expect(message?.textContent).toBe("Please enter a valid email address");
    expect(document.activeElement).toBe(email);
    expect(container.querySelector("#password")!.hasAttribute("aria-invalid")).toBe(false);

    // Editing the field clears its error.
    await act(async () => setValue(email, "admin@example.com"));
    expect(email.hasAttribute("aria-invalid")).toBe(false);
  });
});

describe("admin login errors", () => {
  it("names a rate limit on sign-in, with the wait from Retry-After, as an alert", async () => {
    reply("/api/auth/send-otp", {
      status: 429,
      body: { error: "Too many requests. Please try again later." },
      headers: { "Retry-After": "90" },
    });
    await signIn();
    const alert = container.querySelector('[role="alert"]');
    expect(alert?.textContent).toBe("Too many attempts. Try again in 2 minutes.");
  });

  it("says 1 minute, not 1 minutes", async () => {
    reply("/api/auth/send-otp", { status: 429, headers: { "Retry-After": "30" } });
    await signIn();
    expect(container.querySelector('[role="alert"]')?.textContent).toBe("Too many attempts. Try again in 1 minute.");
  });

  it("names a rate limit on the code check", async () => {
    reply("/api/auth/send-otp", { status: 200, body: { success: true } });
    reply("/api/auth/verify-otp", { status: 429, headers: { "Retry-After": "300" } });
    await signIn();
    await click("verify");
    expect(otpError()).toBe("Too many attempts. Try again in 5 minutes.");
  });

  it("shows a failed resend in words, never the raw code", async () => {
    reply("/api/auth/send-otp", { status: 200, body: { success: true } }, { status: 401, body: { error: "INVALID_CREDENTIALS" } });
    await signIn();
    await click("resend");
    expect(otpError()).toBe("Incorrect email or password");
  });

  it("signs a non-admin out and says so", async () => {
    reply("/api/auth/send-otp", { status: 200, body: { success: true } });
    reply("/api/auth/verify-otp", { status: 200, body: { success: true } });
    reply("/api/admin/auth/verify", { status: 403, body: { error: "Not a platform admin" } });
    await signIn();
    await click("verify");
    expect(h.signOut).toHaveBeenCalledTimes(1);
    // Only this browser: a host who tried the admin login keeps their dashboard sessions elsewhere.
    expect(h.signOut).toHaveBeenCalledWith({ scope: "local" });
    expect(otpError()).toBe("This account isn't a platform admin. You've been signed out.");
    expect(h.push).not.toHaveBeenCalled();
  });

  it("does not call a failed admin check a refusal", async () => {
    reply("/api/auth/send-otp", { status: 200, body: { success: true } });
    reply("/api/auth/verify-otp", { status: 200, body: { success: true } });
    reply("/api/admin/auth/verify", { status: 500, body: { error: "Something went wrong" } });
    await signIn();
    await click("verify");
    expect(h.signOut).not.toHaveBeenCalled();
    expect(otpError()).toBe("Something went wrong. Please try again.");
    expect(h.push).not.toHaveBeenCalled();
  });

  it("goes to /admin when the account is an admin", async () => {
    reply("/api/auth/send-otp", { status: 200, body: { success: true } });
    reply("/api/auth/verify-otp", { status: 200, body: { success: true } });
    reply("/api/admin/auth/verify", { status: 200, body: { admin: { id: "a" } } });
    await signIn();
    await click("verify");
    expect(h.push).toHaveBeenCalledWith("/admin");
    expect(h.signOut).not.toHaveBeenCalled();
  });

  it("returns to the admin page they opened, from ?next=", async () => {
    window.history.replaceState(null, "", "/admin/login?next=%2Fadmin%2Fbilling%2Frejected");
    reply("/api/auth/send-otp", { status: 200, body: { success: true } });
    reply("/api/auth/verify-otp", { status: 200, body: { success: true } });
    reply("/api/admin/auth/verify", { status: 200, body: { admin: { id: "a" } } });
    await signIn();
    await click("verify");
    expect(h.push).toHaveBeenCalledWith("/admin/billing/rejected");
    window.history.replaceState(null, "", "/");
  });

  it("ignores a next that leaves the admin area", async () => {
    window.history.replaceState(null, "", "/admin/login?next=%2F%2Fevil.example%2Fadmin");
    reply("/api/auth/send-otp", { status: 200, body: { success: true } });
    reply("/api/auth/verify-otp", { status: 200, body: { success: true } });
    reply("/api/admin/auth/verify", { status: 200, body: { admin: { id: "a" } } });
    await signIn();
    await click("verify");
    expect(h.push).toHaveBeenCalledWith("/admin");
    window.history.replaceState(null, "", "/");
  });
});
