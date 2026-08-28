import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { cancelRedemptionForBooking } from "@/lib/promo-redemptions-server";
import { createSupabaseMock } from "../../test/helpers/supabase";

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("cancelRedemptionForBooking", () => {
  it("cancels only the pending redemption tied to the booking", async () => {
    const supabase = createSupabaseMock({ tables: { promo_redemptions: {} } });

    await cancelRedemptionForBooking(supabase as unknown as SupabaseClient, "booking-1", "host-1");

    const builder = supabase.builderFor("promo_redemptions");
    expect(builder.update).toHaveBeenCalledWith({ payout_status: "cancelled", updated_by: "host-1" });
    expect(builder.eq).toHaveBeenCalledWith("booking_id", "booking-1");
    // A redemption already paid out must keep its audit row.
    expect(builder.eq).toHaveBeenCalledWith("payout_status", "pending");
  });

  it("logs but never throws when the update fails", async () => {
    const supabase = createSupabaseMock({
      tables: { promo_redemptions: { error: { message: "constraint violation" } } },
    });

    await expect(
      cancelRedemptionForBooking(supabase as unknown as SupabaseClient, "booking-1", "host-1"),
    ).resolves.toBeUndefined();
    expect(console.error).toHaveBeenCalled();
  });

  it("swallows an unexpected client error so cancellation always completes", async () => {
    const exploding = { from: () => { throw new Error("client blew up"); } };

    await expect(
      cancelRedemptionForBooking(exploding as unknown as SupabaseClient, "booking-1", "admin"),
    ).resolves.toBeUndefined();
    expect(console.error).toHaveBeenCalled();
  });
});
