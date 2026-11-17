import { describe, expect, it } from "vitest";
import { walletStatus } from "./wallet-thresholds";

// The wallet page never said where ฿300 sits; hosts met the rule only when refused.
describe("walletStatus", () => {
  it("on Commission: fine at ฿300 or more, low under it, negative below zero", () => {
    expect(walletStatus("commission", 300)).toEqual({ kind: "ok" });
    expect(walletStatus("commission", 141)).toEqual({ kind: "low", short: 159 });
    expect(walletStatus("commission", -20)).toEqual({ kind: "negative", short: 320 });
  });

  it("on another plan: says what switching to Commission needs", () => {
    expect(walletStatus("fixed_rate", 141)).toEqual({ kind: "needForCommission", short: 159 });
    expect(walletStatus("free", 500)).toEqual({ kind: "enoughForCommission" });
  });
});
