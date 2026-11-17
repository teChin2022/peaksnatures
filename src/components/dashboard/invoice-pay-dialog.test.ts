// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({ toastSuccess: vi.fn(), toastError: vi.fn() }));
vi.mock("next-intl", () => ({ useTranslations: () => (key: string) => key }));
vi.mock("sonner", () => ({ toast: { success: h.toastSuccess, error: h.toastError } }));
// The slip picker itself is not under test: a button that hands over a file.
vi.mock("./slip-payment-fields", () => ({
  SlipPaymentFields: ({ onFileChange }: { onFileChange: (f: File) => void }) =>
    createElement("button", { type: "button", onClick: () => onFileChange(new File(["x"], "slip.jpg")) }, "pick-slip"),
}));

import { InvoicePayDialog } from "./invoice-pay-dialog";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;
const onPaid = vi.fn();

const button = (text: string) => [...document.querySelectorAll("button")].find((b) => b.textContent?.trim() === text)!;
const alertText = () => document.querySelector("[role=alert]")?.textContent ?? null;

async function payWith(response: unknown) {
  vi.stubGlobal("fetch", response instanceof Error ? vi.fn().mockRejectedValue(response) : vi.fn().mockResolvedValue({ json: async () => response }));
  await act(async () =>
    root.render(createElement(InvoicePayDialog, { open: true, onOpenChange: vi.fn(), invoiceId: "inv-1", amount: 1500, platformPayment: null, onPaid })),
  );
  await act(async () => button("pick-slip").click());
  await act(async () => button("verifyAndPay").click());
}

beforeEach(() => {
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  h.toastError.mockReset();
  onPaid.mockReset();
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

// A refused slip used to be a toast with the server's English reason, gone in seconds.
describe("InvoicePayDialog: a refused slip", () => {
  it("says why in place, in Thai copy, and keeps the dialog open", async () => {
    await payWith({ verified: false, message: "Amount mismatch: expected ฿1500, got ฿150" });
    expect(alertText()).toBe("amount");
    expect(h.toastError).not.toHaveBeenCalled();
    expect(onPaid).not.toHaveBeenCalled();
  });

  it("says a used slip is a duplicate", async () => {
    await payWith({ error: "This payment slip has already been used.", duplicate: true });
    expect(alertText()).toBe("duplicate");
  });

  it("clears the message when another slip is picked", async () => {
    await payWith({ verified: false, message: "Slip is too old." });
    expect(alertText()).toBe("tooOld");
    await act(async () => button("pick-slip").click());
    expect(alertText()).toBeNull();
  });

  it("tells a connection failure apart from a refused slip", async () => {
    await payWith(new Error("offline"));
    expect(alertText()).toBe("network");
  });
});
