import { describe, expect, it } from "vitest";
import { EventType, eventLabel, fieldLabel, logFields } from "./history-event-types";

describe("eventLabel", () => {
  it("reads an event code as words", () => {
    expect(eventLabel(EventType.HOST_LOGOUT)).toBe("Host logout");
    expect(eventLabel(EventType.BOOKING_DATE_CHANGE_REQUESTED)).toBe("Booking date change requested");
  });

  it("uses the product's words for houses, homestays and check-in", () => {
    expect(eventLabel(EventType.ROOM_DELETED)).toBe("House deleted");
    expect(eventLabel(EventType.PROPERTY_UPDATED)).toBe("Homestay updated");
    expect(eventLabel(EventType.CHECKIN)).toBe("Check-in");
    expect(eventLabel(EventType.WALLET_TOPUP)).toBe("Wallet top-up");
  });

  it("spells AI in the guest assistant events", () => {
    expect(eventLabel(EventType.GUEST_AI_APPROVED)).toBe("Guest AI approved");
    expect(eventLabel(EventType.GUEST_AI_CAP_CHANGED)).toBe("Guest AI cap changed");
  });

  it("names the events whose code would mislead", () => {
    // HOST_VERIFIED is written for unverify too.
    expect(eventLabel(EventType.HOST_VERIFIED)).toBe("Host verification changed");
  });

  it("gives every known event a label that is not the raw code", () => {
    for (const code of Object.values(EventType)) {
      expect(eventLabel(code)).not.toMatch(/_|^[A-Z]{2,}/);
    }
  });

  it("still reads an event it has never seen", () => {
    expect(eventLabel("SOME_NEW_EVENT")).toBe("Some new event");
  });
});

describe("fieldLabel", () => {
  it("reads metadata keys as words", () => {
    expect(fieldLabel("room_id")).toBe("House ID");
    expect(fieldLabel("commission_pct_override")).toBe("Commission % override");
    expect(fieldLabel("ip_address")).toBe("IP address");
    expect(fieldLabel("otpSkipped")).toBe("OTP skipped");
  });
});

describe("logFields", () => {
  it("reads flags as Yes / No, not true / false", () => {
    expect(logFields({ enabled: true, otp_skipped: false })).toEqual([
      { key: "enabled", label: "Enabled", value: "Yes" },
      { key: "otp_skipped", label: "OTP skipped", value: "No" },
    ]);
  });

  // Logs store { to, from } (to first), which read backwards as two chips.
  it("shows a from/to pair as one change, first and in reading order", () => {
    expect(logFields({ to: 500, from: 200, host_name: "Wang" })).toEqual([
      { key: "from, to", label: "Changed", value: "200 → 500" },
      { key: "host_name", label: "Host name", value: "Wang" },
    ]);
  });

  it("keeps a lone from or to as it is", () => {
    expect(logFields({ to: "approved" })).toEqual([{ key: "to", label: "To", value: "approved" }]);
  });

  it("leaves out empty values and survives no data at all", () => {
    expect(logFields({ note: "", reason: null, ip: undefined })).toEqual([]);
    expect(logFields(null)).toEqual([]);
  });

  it("reads objects as Key: value, on one line in a summary and one per line in the detail", () => {
    expect(logFields({ tiers: { months: 3, discount_pct: 2 } })[0].value).toBe("Months: 3, Discount %: 2");
    expect(logFields({ tiers: { months: 3, discount_pct: 2 } }, true)[0].value).toBe("Months: 3\nDiscount %: 2");
  });

  // Rate override and billing config store whole objects: show only what changed, field by field.
  it("splits an object change pair into one line per field that changed", () => {
    const fields = logFields({
      previous: { fixed_rate_override: null, commission_pct_override: 3 },
      new: { fixed_rate_override: 500, commission_pct_override: 3 },
      set_by: "super_admin",
    });
    expect(fields).toEqual([
      { key: "previous.fixed_rate_override, new.fixed_rate_override", label: "Fixed rate override", value: "— → 500" },
      { key: "set_by", label: "Set by", value: "super_admin" },
    ]);
    expect(logFields({ before: { promptpay_id: "081" }, after: { promptpay_id: "082" } })[0]).toMatchObject({
      label: "Promptpay ID",
      value: "081 → 082",
    });
  });

  it("reads enum codes as words and dates as dates (times in Bangkok)", () => {
    const fields = logFields({
      plan_type: "fixed_rate",
      plan_free_expires_at: "2026-09-30T00:00:00.000Z",
      period_end: "2026-11-30",
      slug: "cozy-villa",
      email: "a_b@example.com",
    });
    expect(fields.map((f) => f.value)).toEqual(["Fixed rate", "Sep 30, 2026, 07:00", "Nov 30, 2026", "cozy-villa", "a_b@example.com"]);
  });
});
