// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string, values?: Record<string, string>) => (values?.min ? `${key}:${values.min}` : key),
  useLocale: () => "th",
}));
vi.mock("next/navigation", () => ({ usePathname: () => "/dashboard/billing", useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));
// Motion's animations reject on unmount in happy-dom; render plain elements instead.
vi.mock("motion/react", async () => {
  const { createElement: h } = await import("react");
  const MOTION_PROPS = new Set(["initial", "animate", "exit", "transition", "layout", "whileHover", "whileTap", "variants"]);
  const plain = (tag: string) => (props: Record<string, unknown>) =>
    h(tag, Object.fromEntries(Object.entries(props).filter(([k]) => !MOTION_PROPS.has(k))));
  return {
    motion: new Proxy({}, { get: (_t, tag: string) => plain(tag) }),
    AnimatePresence: ({ children }: { children: unknown }) => children,
  };
});
vi.mock("next/link", () => ({
  default: ({ children, href }: { children: unknown; href: string }) => createElement("a", { href }, children as never),
}));

import BillingPage from "./page";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const billing = (over: Record<string, unknown>) => ({
  plan_type: "fixed_rate", plan_free_expires_at: null, plan_pending_type: null, plan_pending_effective_at: null,
  plan_pending_term_months: null, wallet_balance: 141, effective_commission_pct: 3, effective_quick_commission_pct: 1,
  effective_fixed_rate: 10, fixed_rate_term_months: null, fixed_rate_term_started_at: null, fixed_rate_term_ends_at: null,
  fixed_rate_term_tiers: [], platform_payment: null, invoices: [], recent_transactions: [], ...over,
});

let container: HTMLDivElement;
let root: Root;

async function render(data: Record<string, unknown>) {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => data }));
  await act(async () => root.render(createElement(BillingPage)));
  await act(async () => {});
}

const ctaFor = (planKey: string) =>
  [...container.querySelectorAll("button")].find((b) => b.textContent?.includes("switchToPlan") && b.closest("div")?.textContent?.includes(`payHow_${planKey}`));

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

// The three cards listed the same features; Jordan met the ฿300 wallet rule only when refused.
describe("BillingPage: plan cards", () => {
  it("says how each plan is paid, with the wallet minimum on Commission", async () => {
    await render(billing({}));
    expect(container.textContent).toContain("payHow_free");
    expect(container.textContent).toContain("payHow_commission:300");
    expect(container.textContent).toContain("payHow_fixed_rate");
  });

  it("explains that the free plan can't be chosen, instead of a faded button", async () => {
    await render(billing({}));
    expect(container.textContent).toContain("freeNotAvailable");
  });

  it("does not push Commission as the main choice to a host whose wallet can't take it", async () => {
    await render(billing({ wallet_balance: 141 }));
    expect(ctaFor("commission")?.className).not.toContain("bg-brand");
    await act(async () => root.unmount());
    root = createRoot(container);
    await render(billing({ wallet_balance: 500 }));
    expect(ctaFor("commission")?.className).toContain("bg-brand");
  });
});
