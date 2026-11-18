// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import AdminSettingsPage from "./page";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const config = {
  id: "cfg-1",
  commission_pct: 7,
  quick_commission_pct: 7,
  fixed_rate_amount: 100,
  fixed_rate_term_tiers: [{ months: 3, discount_pct: 0 }],
  promptpay_id: "0812345678",
  bank_name: "KBank",
  bank_account_number: "1234567890",
  bank_account_name: "Peaksnature",
  payment_display: "qr",
};

let root: Root;
let container: HTMLDivElement;
const fetchMock = vi.fn();
const puts = () => fetchMock.mock.calls.filter(([, init]) => (init as RequestInit | undefined)?.method === "PUT");
const putBody = () => JSON.parse(String((puts()[0][1] as RequestInit).body));

const type = async (id: string, value: string) => {
  const input = document.getElementById(id) as HTMLInputElement;
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
  await act(async () => {
    setter.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
};
const click = async (text: string) => {
  const button = [...document.querySelectorAll("button")].find((b) => b.textContent?.trim() === text);
  if (!button) throw new Error(`no button "${text}"`);
  await act(async () => {
    // happy-dom does not submit a form from a submit button's click().
    if (button.type === "submit" && button.form) button.form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    else button.click();
  });
};

beforeEach(async () => {
  fetchMock.mockReset().mockImplementation(async (url: string, init?: RequestInit) => {
    if (url === "/api/admin/billing-config" && init?.method === "PUT") {
      return { ok: true, json: async () => ({ ...config, ...JSON.parse(String(init.body)) }) };
    }
    if (url === "/api/admin/billing-config") return { ok: true, json: async () => config };
    return { ok: true, json: async () => ({ data: [] }) };
  });
  vi.stubGlobal("fetch", fetchMock);
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root.render(createElement(AdminSettingsPage));
  });
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

describe("Admin settings: billing configuration", () => {
  it("saves a rate change straight away", async () => {
    await type("commission_pct", "8");
    await click("Save Billing Configuration");

    expect(document.body.textContent).not.toContain("Change where hosts pay?");
    expect(puts()).toHaveLength(1);
    expect(putBody().commission_pct).toBe(8);
  });

  // Hosts transfer to these details: a typo sends real money to the wrong place.
  it("asks before changing where hosts pay, showing old and new", async () => {
    await type("promptpay_id", "0899999999");
    await click("Save Billing Configuration");

    expect(document.body.textContent).toContain("Change where hosts pay?");
    expect(document.body.textContent).toContain("0812345678");
    expect(document.body.textContent).toContain("0899999999");
    expect(puts()).toHaveLength(0);

    await click("Save new details");
    expect(puts()).toHaveLength(1);
    expect(putBody().promptpay_id).toBe("0899999999");
  });

  it("saves nothing when the payout change is cancelled", async () => {
    await type("bank_account_number", "999");
    await click("Save Billing Configuration");
    await click("Cancel");

    expect(puts()).toHaveLength(0);
  });
});
