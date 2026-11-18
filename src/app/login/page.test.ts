// @vitest-environment happy-dom
import { act, createElement, useEffect } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({ push: vi.fn(), refresh: vi.fn(), query: "" }));

vi.mock("next-intl", () => ({ useTranslations: () => (key: string) => key }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: h.push, refresh: h.refresh }),
  useSearchParams: () => new URLSearchParams(h.query),
}));
vi.mock("next/link", () => ({
  default: ({ children, href }: { children: unknown; href: string }) => createElement("a", { href }, children as never),
}));
vi.mock("next/image", () => ({ default: () => null }));
vi.mock("@marsidev/react-turnstile", () => ({
  Turnstile: ({ onSuccess }: { onSuccess: (t: string) => void }) => {
    useEffect(() => onSuccess("token"), [onSuccess]);
    return null;
  },
}));
vi.mock("@/components/otp-modal", () => ({
  default: ({ onVerify }: { onVerify: (c: string) => void }) =>
    createElement("button", { type: "button", onClick: () => onVerify("123456") }, "verify"),
}));

import LoginPage from "./page";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;

async function type(id: string, value: string) {
  const input = container.querySelector<HTMLInputElement>(`#${id}`)!;
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
  await act(async () => {
    setter.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

/** Signs in; `otpRequired` false goes straight in, true goes through the code. */
async function signIn(otpRequired: boolean) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => ({
      ok: true,
      status: 200,
      json: async () => (url === "/api/auth/send-otp" ? { success: true, otpRequired } : { success: true }),
    })),
  );
  await act(async () => {
    root.render(createElement(LoginPage));
  });
  await type("email", "host@example.com");
  await type("password", "secret123");
  await act(async () => {
    container.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
  });
  if (otpRequired) {
    const verify = [...document.querySelectorAll("button")].find((b) => b.textContent === "verify")!;
    await act(async () => verify.click());
  }
}

beforeEach(() => {
  h.push.mockReset();
  h.refresh.mockReset();
  h.query = "";
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

describe("host login: where it goes after signing in", () => {
  it("returns to the dashboard page the middleware recorded", async () => {
    h.query = "next=%2Fdashboard%2Fbookings";
    await signIn(false);
    expect(h.push).toHaveBeenCalledWith("/dashboard/bookings");
  });

  it("goes to the dashboard with no next", async () => {
    await signIn(true);
    expect(h.push).toHaveBeenCalledWith("/dashboard");
  });

  // Open redirect: /login?next=https://evil.example sent a host off-site after a real login.
  it.each(["https://evil.example/dashboard", "//evil.example/dashboard", "/\\evil.example", "/admin"])(
    "never follows next=%s, with or without the code step",
    async (next) => {
      h.query = `next=${encodeURIComponent(next)}`;
      await signIn(false);
      expect(h.push).toHaveBeenLastCalledWith("/dashboard");

      act(() => root.unmount());
      root = createRoot(container);
      h.push.mockReset();
      await signIn(true);
      expect(h.push).toHaveBeenLastCalledWith("/dashboard");
    },
  );
});
