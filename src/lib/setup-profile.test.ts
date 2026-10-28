import { describe, expect, it } from "vitest";
import { setupProfileUpdate } from "@/lib/setup-profile";

describe("setupProfileUpdate", () => {
  it("leaves a phone given at registration alone when only PromptPay is asked for", () => {
    expect(
      setupProfileUpdate({ needsPhone: false, phone: "", needsPromptpay: true, promptpayId: "0812345678" }),
    ).toStrictEqual({ promptpay_id: "0812345678" });
  });

  it("leaves an existing PromptPay ID alone when only the phone is asked for", () => {
    expect(
      setupProfileUpdate({ needsPhone: true, phone: "0812345678", needsPromptpay: false, promptpayId: "" }),
    ).toStrictEqual({ phone: "0812345678" });
  });

  it("writes both, trimmed, when both are asked for", () => {
    expect(
      setupProfileUpdate({ needsPhone: true, phone: " 0812345678 ", needsPromptpay: true, promptpayId: " 0899999999 " }),
    ).toStrictEqual({ phone: "0812345678", promptpay_id: "0899999999" });
  });
});
