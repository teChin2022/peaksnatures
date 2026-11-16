import { describe, expect, it } from "vitest";
import type { Host } from "@/types/database";
import { BOOKING_HOST_FIELDS, isHostApproved, toBookingHost } from "@/lib/public-host";

// A full row as `hosts.select("*")` returns it, secrets included.
const host = {
  id: "host-1",
  user_id: "auth-user-1",
  name: "Somchai",
  email: "somchai@example.com",
  phone: "0812345678",
  promptpay_id: "0812345678",
  line_user_id: "U-line-user",
  line_channel_access_token: "secret-line-token",
  security_pin_hash: "$2a$10$secret-pin-hash",
  deposit_amount: 500,
  deposit_by_month: { "12": 1000 },
  cancellation_days: 14,
  payment_display: "promptpay",
  bank_name: "Kasikorn Bank",
  bank_account_number: "123-4-56789-0",
  bank_account_name: "Somchai J.",
  booking_draft_hours: 24,
  guest_booking_mode: "quick",
  wallet_balance: 5000,
  commission_pct_override: 5,
  plan_type: "commission",
} as unknown as Host;

describe("toBookingHost", () => {
  it("keeps exactly the fields the booking form reads", () => {
    expect(Object.keys(toBookingHost(host)).sort()).toEqual([...BOOKING_HOST_FIELDS].sort());
  });

  it("never passes the host's secrets or account data to the page", () => {
    const picked = toBookingHost(host) as Record<string, unknown>;
    for (const key of [
      "line_channel_access_token",
      "security_pin_hash",
      "line_user_id",
      "user_id",
      "email",
      "wallet_balance",
      "commission_pct_override",
    ]) {
      expect(picked).not.toHaveProperty(key);
    }
  });

  it("copies the payment and terms values unchanged", () => {
    expect(toBookingHost(host)).toMatchObject({
      name: "Somchai",
      promptpay_id: "0812345678",
      deposit_by_month: { "12": 1000 },
      cancellation_days: 14,
      booking_draft_hours: 24,
    });
  });

  it("passes the guest booking mode and the phone the quick-booking contact block needs", () => {
    expect(toBookingHost(host)).toMatchObject({ guest_booking_mode: "quick", phone: "0812345678" });
  });
});

describe("isHostApproved", () => {
  it("is true only for an approved host", () => {
    expect(isHostApproved({ status: "approved" })).toBe(true);
  });

  it.each([["pending"], ["rejected"], [""], [null], [undefined]])("is false for status %j", (status) => {
    expect(isHostApproved({ status })).toBe(false);
  });

  it("is false when there is no host row", () => {
    expect(isHostApproved(null)).toBe(false);
    expect(isHostApproved(undefined)).toBe(false);
  });
});
