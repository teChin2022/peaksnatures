import { beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "./route";
import { signIn, signOut } from "../../../../../../test/helpers/auth";
import { makeRequest, readJson } from "../../../../../../test/helpers/request";

const h = vi.hoisted(() => ({
  createServerSupabaseClient: vi.fn(),
  createServiceRoleClient: vi.fn(),
  refundCommission: vi.fn(),
  deductCommission: vi.fn(),
  getHostBlockState: vi.fn(),
  isHostBlocked: vi.fn(),
  afterCallbacks: [] as Array<() => unknown>,
}));

vi.mock("@/lib/supabase/server", () => ({
  createServerSupabaseClient: h.createServerSupabaseClient,
  createServiceRoleClient: h.createServiceRoleClient,
}));
vi.mock("@/lib/billing", () => ({
  refundCommission: h.refundCommission,
  deductCommission: h.deductCommission,
  getHostBlockState: h.getHostBlockState,
}));
vi.mock("@/lib/plan-expiry", () => ({ isHostBlocked: h.isHostBlocked }));
vi.mock("@/lib/notifications", () => ({ sendDateChangeEmailToGuest: vi.fn() }));
vi.mock("@/lib/booking-pricing", () => ({ computeRoomRateTotal: vi.fn() }));
vi.mock("@/lib/history-log", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/history-log")>()),
  logEvent: vi.fn(),
}));
vi.mock("next/server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/server")>()),
  after: (cb: () => unknown) => {
    h.afterCallbacks.push(cb);
  },
}));

const REQUEST = {
  id: "dcr-1",
  booking_id: "bk-1",
  old_check_in: "2026-11-01",
  old_check_out: "2026-11-03",
  new_check_in: "2026-11-05",
  new_check_out: "2026-11-08",
  old_total_price: 3000,
  new_total_price: 4500,
  price_difference: 1500,
  easyslip_verified: false,
  old_room_id: null,
  new_room_id: null,
  additional_payment: 0,
};
const BOOKING = { id: "bk-1", homestay_id: "hs-1", room_id: null, commission_base: null, amount_paid: 3000 };

function mockClient(plan_type: string) {
  return signIn(h, {
    tables: {
      date_change_requests: { data: REQUEST },
      bookings: { data: BOOKING },
      homestays: { data: { id: "hs-1", hosts: { id: "host-1", user_id: "user-1", name: "Peaks", plan_type } } },
    },
  });
}

const approve = async () => {
  const res = await POST(makeRequest("/api/bookings/change-dates/approve", { body: { request_id: "dcr-1" } }));
  for (const cb of h.afterCallbacks) await cb();
  return res;
};

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  h.afterCallbacks.length = 0;
  h.getHostBlockState.mockResolvedValue({ plan_type: "commission" });
  h.isHostBlocked.mockReturnValue(false);
});

describe("POST /api/bookings/change-dates/approve — commission", () => {
  it("re-prices the fee for a host on Commission: refund the old, charge the new", async () => {
    mockClient("commission");
    const res = await approve();

    expect(res.status).toBe(200);
    expect(h.refundCommission).toHaveBeenCalledWith("bk-1");
    expect(h.deductCommission).toHaveBeenCalledWith("bk-1");
    expect(h.refundCommission.mock.invocationCallOrder[0]).toBeLessThan(
      h.deductCommission.mock.invocationCallOrder[0],
    );
  });

  // deductCommission charges nothing off Commission, so this pair used to hand
  // the fee back to a host who had since switched to Fixed Rate.
  it.each(["fixed_rate", "free"])("leaves the fee alone for a host now on %s", async (plan) => {
    mockClient(plan);
    const res = await approve();

    expect(res.status).toBe(200);
    expect(h.refundCommission).not.toHaveBeenCalled();
    expect(h.deductCommission).not.toHaveBeenCalled();
  });

  it("turns away a signed-out caller", async () => {
    signOut(h);
    await expect(readJson(await approve())).resolves.toEqual({
      status: 401,
      body: { error: "Unauthorized" },
    });
  });
});
