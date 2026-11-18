import { describe, expect, it } from "vitest";
import { walletAdjustment } from "./wallet-adjust";

describe("walletAdjustment", () => {
  it("signs the amount from the direction and previews the balance", () => {
    expect(walletAdjustment(500, "200", "add")).toEqual({ amount: 200, after: 700 });
    expect(walletAdjustment(500, "200", "deduct")).toEqual({ amount: -200, after: 300 });
    // A deduction may take the wallet below zero; the preview must show it.
    expect(walletAdjustment(100, "250", "deduct")).toEqual({ amount: -250, after: -150 });
  });

  it("refuses anything but a whole number above zero", () => {
    for (const entry of ["", "0", "-50", "12.5", "abc", "1e3"]) {
      expect(walletAdjustment(500, entry, "add")).toBeNull();
    }
  });
});
