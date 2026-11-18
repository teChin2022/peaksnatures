import { describe, expect, it } from "vitest";
import { EventType, eventLabel, fieldLabel } from "./history-event-types";

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
