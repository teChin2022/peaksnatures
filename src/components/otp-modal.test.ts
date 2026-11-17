// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { withIntl } from "../../test/helpers/intl";
import OtpModal from "./otp-modal";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;
let onVerify: ReturnType<typeof vi.fn<(otp: string) => Promise<void>>>;
let onClose: ReturnType<typeof vi.fn<() => void>>;

beforeEach(() => {
  onVerify = vi.fn<(otp: string) => Promise<void>>(async () => {});
  onClose = vi.fn<() => void>();
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

const render = (
  { error = null, loading = false, locale = "en" }: { error?: string | null; loading?: boolean; locale?: "th" | "en" } = {},
) =>
  act(async () =>
    root.render(
      withIntl(
        createElement(OtpModal, { email: "a@example.com", onVerify, onResend: async () => {}, onClose, error, loading }),
        locale,
      ),
    ),
  );

// The dialog portals to <body>, outside the render container.
const dialog = () => document.querySelector<HTMLElement>('[role="dialog"]');
const digits = () => [...document.querySelectorAll<HTMLInputElement>('input[autocomplete="one-time-code"]')];

const type = (el: HTMLInputElement, value: string) =>
  act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(el, value);
    el.dispatchEvent(new Event("input", { bubbles: true }));
  });

const pressEscape = () =>
  act(async () => {
    (document.activeElement ?? document.body).dispatchEvent(
      new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }),
    );
  });

describe("OtpModal", () => {
  it("announces its error to screen readers", async () => {
    await render({ error: "Invalid verification code." });
    expect(document.querySelector('[role="alert"]')?.textContent).toBe("Invalid verification code.");
  });

  it("has no alert without an error", async () => {
    await render();
    expect(document.querySelector('[role="alert"]')).toBeNull();
  });

  it("is a modal dialog named by its title", async () => {
    await render();
    const d = dialog();
    expect(d).not.toBeNull();
    const title = document.getElementById(d!.getAttribute("aria-labelledby") ?? "");
    expect(title?.textContent).toBe("Enter Verification Code");
  });

  it("declares the language of its copy, since it renders outside the page's <main>", async () => {
    await render({ locale: "en" });
    expect(dialog()?.getAttribute("lang")).toBe("en");
  });

  it("names each digit field, in Thai too", async () => {
    await render({ locale: "th" });
    expect(digits().map((d) => d.getAttribute("aria-label"))).toEqual([
      "หลักที่ 1 จาก 6", "หลักที่ 2 จาก 6", "หลักที่ 3 จาก 6", "หลักที่ 4 จาก 6", "หลักที่ 5 จาก 6", "หลักที่ 6 จาก 6",
    ]);
  });

  it("starts on the first digit", async () => {
    await render();
    expect(document.activeElement).toBe(digits()[0]);
  });

  it("closes on Escape", async () => {
    await render();
    await pressEscape();
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("does not close on Escape while the code is being checked", async () => {
    await render({ loading: true });
    await pressEscape();
    expect(onClose).not.toHaveBeenCalled();
  });

  it("names the close button in the page's language", async () => {
    await render({ locale: "th" });
    expect(document.querySelector('[aria-label="ปิด"]')).not.toBeNull();
  });

  it("clears a wrong code and puts the cursor back on the first digit", async () => {
    await render();
    for (const [i, d] of digits().entries()) await type(d, String(i + 1));
    await render({ error: "Invalid verification code." });
    expect(digits().map((d) => d.value).join("")).toBe("");
    expect(document.activeElement).toBe(digits()[0]);
  });

  it("hands focus to returnFocusRef when it closes, not to <body>", async () => {
    const signIn = document.createElement("button");
    container.after(signIn);
    const props = { email: "a@example.com", onVerify, onResend: async () => {}, onClose, error: null, loading: false };
    await act(async () => root.render(withIntl(createElement(OtpModal, { ...props, returnFocusRef: { current: signIn } }), "en")));
    // The page closes it by unmounting; Radix moves focus on the next tick.
    await act(async () => root.render(withIntl(null, "en")));
    await act(async () => new Promise((r) => setTimeout(r, 10)));
    expect(document.activeElement).toBe(signIn);
    signIn.remove();
  });

  it("checks the code once all six digits are typed", async () => {
    await render();
    for (const [i, d] of digits().entries()) await type(d, String(i + 1));
    expect(onVerify).toHaveBeenCalledWith("123456");
  });
});
