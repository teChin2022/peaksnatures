import { beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "./route";
import { signIn, signOut } from "../../../../../../test/helpers/auth";
import { makeRequest, readJson } from "../../../../../../test/helpers/request";
import type { QueryResponse } from "../../../../../../test/helpers/supabase";

const h = vi.hoisted(() => ({
  createServerSupabaseClient: vi.fn(),
  createServiceRoleClient: vi.fn(),
  refundCommission: vi.fn(),
  deductCommission: vi.fn(),
  getHostBlockState: vi.fn(),
  isHostBlocked: vi.fn(),
  computeRoomRateTotal: vi.fn(),
  logEvent: vi.fn(),
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
vi.mock("@/lib/booking-pricing", () => ({ computeRoomRateTotal: h.computeRoomRateTotal }));
vi.mock("@/lib/history-log", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/history-log")>()),
  logEvent: h.logEvent,
}));
vi.mock("next/server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/server")>()),
  after: (cb: () => unknown) => {
    h.afterCallbacks.push(cb);
  },
}));

const BOOKING_ID = "11111111-1111-4111-8111-111111111111";
const ROOM_A = "22222222-2222-4222-8222-222222222222";
const ROOM_B = "33333333-3333-4333-8333-333333333333";

const BOOKING = {
  id: BOOKING_ID,
  homestay_id: "hs-1",
  room_id: ROOM_A,
  check_in: "2026-12-01",
  check_out: "2026-12-03",
  total_price: 3000,
  discount_amount: 0,
  amount_paid: 3000,
  commission_base: 2800,
  status: "confirmed",
  booking_source: "agoda",
  group_id: null,
  checked_in_at: null,
};

const BODY = {
  booking_id: BOOKING_ID,
  new_room_id: ROOM_B,
  new_check_in: "2026-12-05",
  new_check_out: "2026-12-08",
  total_price: 4500,
};

function mockClient({
  booking = {},
  plan_type = "commission",
  ownerId = "user-1",
  room = { id: ROOM_B, homestay_id: "hs-1", quantity: 1 },
  pending = [] as unknown[],
  holds = 0,
  rpc = {} as QueryResponse,
}: {
  booking?: Record<string, unknown>;
  plan_type?: string;
  ownerId?: string;
  room?: unknown;
  pending?: unknown[];
  holds?: number;
  rpc?: QueryResponse;
} = {}) {
  return signIn(h, {
    tables: {
      bookings: [{ data: { ...BOOKING, ...booking } }, { count: 0 }, {}],
      homestays: { data: { id: "hs-1", hosts: { id: "host-1", user_id: ownerId, name: "Peaks", plan_type } } },
      host_staff: { data: null },
      // Pending check, competing requests count, insert, delete.
      date_change_requests: [{ data: pending }, { count: 0 }, { data: { id: "dcr-new" } }, {}],
      rooms: { data: room },
      booking_holds: { count: holds },
    },
    rpc: { approve_date_change_atomic: rpc },
  });
}

const change = async (body: unknown = BODY) => {
  const res = await POST(makeRequest("/api/bookings/change-dates/host", { body }));
  for (const cb of h.afterCallbacks) await cb();
  return res;
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
  h.afterCallbacks.length = 0;
  h.getHostBlockState.mockResolvedValue({ plan_type: "commission" });
  h.isHostBlocked.mockReturnValue(false);
  h.computeRoomRateTotal.mockResolvedValue(3600);
});

describe("POST /api/bookings/change-dates/host", () => {
  it("moves a host-entered booking at the host's price, approved at once, and re-prices the fee", async () => {
    const supabase = mockClient();
    const res = await change();

    expect(res.status).toBe(200);
    expect(supabase.builderFor("date_change_requests", 2).insert).toHaveBeenCalledWith(
      expect.objectContaining({
        booking_id: BOOKING_ID,
        old_room_id: ROOM_A,
        new_room_id: ROOM_B,
        new_check_in: "2026-12-05",
        new_check_out: "2026-12-08",
        old_total_price: 3000,
        new_total_price: 4500,
        price_difference: 1500,
        additional_payment: 0,
        easyslip_verified: false,
        status: "pending",
        requested_by: "Peaks",
      }),
    );
    expect(supabase.rpc).toHaveBeenCalledWith("approve_date_change_atomic", {
      p_request_id: "dcr-new",
      p_approved_by: "Peaks",
    });
    // The quick booking's commission base follows the new house and dates.
    expect(h.computeRoomRateTotal).toHaveBeenCalledWith(supabase, ROOM_B, "2026-12-05", "2026-12-08");
    expect(supabase.builderFor("bookings", 1).update).toHaveBeenCalledWith({ commission_base: 3600 });
    expect(h.refundCommission).toHaveBeenCalledWith(BOOKING_ID);
    expect(h.deductCommission).toHaveBeenCalledWith(BOOKING_ID);
    expect(h.logEvent).toHaveBeenCalledWith(
      expect.objectContaining({ eventType: "BOOKING_DATE_CHANGE_APPROVED", actorType: "host", actorId: "user-1" }),
    );
  });

  it.each(["fixed_rate", "free"])("leaves the fee alone for a host on %s", async (plan_type) => {
    mockClient({ plan_type });
    expect((await change()).status).toBe(200);
    expect(h.refundCommission).not.toHaveBeenCalled();
    expect(h.deductCommission).not.toHaveBeenCalled();
  });

  it("removes the request it made when the house is taken, so nothing stays pending", async () => {
    const supabase = mockClient({ rpc: { error: { message: "DATES_UNAVAILABLE" } } });
    await expect(readJson(await change())).resolves.toEqual({ status: 409, body: { error: "DATES_UNAVAILABLE" } });

    const cleanup = supabase.builderFor("date_change_requests", 3);
    expect(cleanup.delete).toHaveBeenCalled();
    expect(cleanup.eq).toHaveBeenCalledWith("id", "dcr-new");
    expect(h.deductCommission).not.toHaveBeenCalled();
  });

  it("refuses a house another guest is holding at checkout, before writing anything", async () => {
    const supabase = mockClient({ holds: 1 });
    await expect(readJson(await change())).resolves.toEqual({ status: 409, body: { error: "DATES_HELD" } });
    expect(supabase.rpc).not.toHaveBeenCalled();
    expect(supabase.calls.filter((c) => c.table === "date_change_requests")).toHaveLength(2);
  });

  it.each([
    ["a guest's own booking", { booking_source: "guest" }, 400, "NOT_QUICK_BOOKING"],
    ["one house of a cart", { group_id: "grp-1" }, 400, "NOT_QUICK_BOOKING"],
    ["a cancelled booking", { status: "cancelled" }, 400, "INVALID_STATUS"],
    ["a guest already checked in", { checked_in_at: "2026-12-01T08:00:00Z" }, 400, "ALREADY_CHECKED_IN"],
  ])("refuses %s", async (_name, booking, status, error) => {
    const supabase = mockClient({ booking });
    await expect(readJson(await change())).resolves.toEqual({ status, body: { error } });
    expect(supabase.rpc).not.toHaveBeenCalled();
  });

  it("refuses while the guest's own request waits for the host", async () => {
    const supabase = mockClient({ pending: [{ id: "dcr-guest" }] });
    await expect(readJson(await change())).resolves.toEqual({ status: 409, body: { error: "PENDING_EXISTS" } });
    expect(supabase.rpc).not.toHaveBeenCalled();
  });

  it("refuses a house from another homestay", async () => {
    const supabase = mockClient({ room: { id: ROOM_B, homestay_id: "hs-other", quantity: 1 } });
    expect((await change()).status).toBe(400);
    expect(supabase.rpc).not.toHaveBeenCalled();
  });

  it("refuses a change that changes nothing", async () => {
    mockClient();
    const same = { ...BODY, new_room_id: ROOM_A, new_check_in: "2026-12-01", new_check_out: "2026-12-03" };
    expect((await change(same)).status).toBe(400);
  });

  it.each([
    ["a negative price", { ...BODY, total_price: -1 }],
    ["check-out before check-in", { ...BODY, new_check_out: "2026-12-04" }],
  ])("refuses %s", async (_name, body) => {
    const supabase = mockClient();
    expect((await change(body)).status).toBe(400);
    expect(supabase.rpc).not.toHaveBeenCalled();
  });

  it("refuses a host in bad billing standing", async () => {
    h.isHostBlocked.mockReturnValue(true);
    const supabase = mockClient();
    expect((await change()).status).toBe(403);
    expect(supabase.rpc).not.toHaveBeenCalled();
  });

  it("refuses a login that is neither the owner nor staff", async () => {
    const supabase = mockClient({ ownerId: "owner-9" });
    await expect(readJson(await change())).resolves.toEqual({ status: 403, body: { error: "Forbidden" } });
    expect(supabase.rpc).not.toHaveBeenCalled();
  });

  it("turns away a signed-out caller", async () => {
    signOut(h);
    await expect(readJson(await change())).resolves.toEqual({ status: 401, body: { error: "Unauthorized" } });
  });
});
