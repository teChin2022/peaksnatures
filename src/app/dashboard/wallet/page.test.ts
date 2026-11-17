// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string, values?: Record<string, string>) => (values ? `${key}:${Object.values(values).join(",")}` : key),
  useLocale: () => "th",
}));
vi.mock("next/navigation", () => ({ usePathname: () => "/dashboard/wallet", useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));
vi.mock("next/link", () => ({
  default: ({ children, href }: { children: unknown; href: string }) => createElement("a", { href }, children as never),
}));
// Motion's animations reject on unmount in happy-dom; render plain elements instead.
vi.mock("motion/react", async () => {
  const { createElement: h } = await import("react");
  const MOTION_PROPS = new Set(["initial", "animate", "exit", "transition", "layout", "whileHover", "whileTap", "variants"]);
  const plain = (tag: string) => (props: Record<string, unknown>) =>
    h(tag, Object.fromEntries(Object.entries(props).filter(([k]) => !MOTION_PROPS.has(k))));
  return { motion: new Proxy({}, { get: (_t, tag: string) => plain(tag) }), AnimatePresence: ({ children }: { children: unknown }) => children };
});

import WalletPage from "./page";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;

async function render(balance: number) {
  vi.stubGlobal("fetch", vi.fn(async (url: string) => {
    const body = url.startsWith("/api/host/billing")
      ? { plan_type: "commission", wallet_balance: balance, effective_commission_pct: 3, effective_quick_commission_pct: 1, platform_payment: { promptpay_id: "0812345678", bank_account_name: "Peaksnature", payment_display: "qr" }, invoices: [] }
      : url.startsWith("/api/host/wallet/transactions") ? { transactions: [], total: 0 } : { invoices: [] };
    return { ok: true, json: async () => body };
  }));
  await act(async () => root.render(createElement(WalletPage)));
  await act(async () => {});
}

const qr = () => container.querySelector("svg");
const amountButton = (n: string) => [...container.querySelectorAll("button")].find((b) => b.textContent?.trim() === `฿${n}`)!;

beforeEach(() => {
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

describe("WalletPage: top-up", () => {
  // A QR for ฿0 invited a hand-typed amount that the upload then refused.
  it("shows the PromptPay QR only once an amount is chosen", async () => {
    await render(141);
    expect(container.textContent).not.toContain("scanToPay");
    await act(async () => amountButton("500").click());
    expect(container.textContent).toContain("scanToPay");
    expect(amountButton("500").getAttribute("aria-pressed")).toBe("true");
  });

  it("says when one top-up can't cover what is owed", async () => {
    await render(-1400);
    expect(container.textContent).toContain("threshold_negative:300,1,700");
    expect(container.textContent).toContain("threshold_multiple:1,500");
  });

  it("does not mention several top-ups when one is enough", async () => {
    await render(141);
    expect(container.textContent).not.toContain("threshold_multiple");
  });
});
