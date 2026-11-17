import { describe, expect, it } from "vitest";
import { slipErrorKey } from "./slip-error";

// The routes' own refusal bodies (invoices/[id]/pay, plan/activate, wallet/topup).
describe("slipErrorKey", () => {
  it("reads each refusal the routes send", () => {
    expect(slipErrorKey({ error: "This payment slip has already been used.", duplicate: true })).toBe("duplicate");
    expect(slipErrorKey({ error: "Slip already used", duplicate: true })).toBe("duplicate");
    expect(slipErrorKey({ message: "Slip is too old. Use a recent transfer." })).toBe("tooOld");
    expect(slipErrorKey({ message: "Receiver does not match platform account." })).toBe("receiver");
    expect(slipErrorKey({ message: "Amount mismatch: expected ฿1500, got ฿150" })).toBe("amount");
  });

  it("falls back to a general failure", () => {
    expect(slipErrorKey({ error: "Failed to update invoice" })).toBe("failed");
    expect(slipErrorKey(null)).toBe("failed");
  });
});
