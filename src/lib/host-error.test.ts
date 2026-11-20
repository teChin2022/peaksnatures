import { describe, expect, it } from "vitest";
import { hostErrorKey } from "./host-error";

describe("hostErrorKey", () => {
  it("reads the codes the booking routes send", () => {
    expect(hostErrorKey({ error: "HOST_BLOCKED", message: "Please settle billing before checking in guests." })).toBe("blocked");
    expect(hostErrorKey({ error: "INVALID_STATUS", message: "Confirmed bookings can only be cancelled" })).toBe("invalidStatus");
    expect(hostErrorKey({ error: "ALREADY_CHECKED_IN", message: "Already checked in" })).toBe("alreadyCheckedIn");
    expect(hostErrorKey({ error: "Forbidden" })).toBe("forbidden");
  });

  it("reads the quick-booking route's blocked sentence, which has no code", () => {
    expect(hostErrorKey({ error: "Your account is temporarily blocked. Please settle billing to continue." })).toBe("blocked");
  });

  it("treats a booking or request that is gone as stale", () => {
    expect(hostErrorKey({ error: "Booking not found" })).toBe("stale");
    expect(hostErrorKey({ error: "Request not found or already processed" })).toBe("stale");
  });

  it("returns null for anything else, so the caller keeps its own message", () => {
    expect(hostErrorKey({ error: "Failed to update booking status" })).toBeNull();
    expect(hostErrorKey({ error: { code: "23505" } })).toBeNull();
    expect(hostErrorKey(null)).toBeNull();
  });
});
