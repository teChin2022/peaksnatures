import { beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "./route";
import { EventType } from "@/lib/history-log";
import { createSupabaseMock, type QueryResponse } from "../../../../../test/helpers/supabase";
import { makeRequest, readJson } from "../../../../../test/helpers/request";

const h = vi.hoisted(() => ({
  createServerSupabaseClient: vi.fn(),
  createServiceRoleClient: vi.fn(),
  afterCallbacks: [] as Array<() => unknown>,
  logEvent: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createServerSupabaseClient: h.createServerSupabaseClient,
  createServiceRoleClient: h.createServiceRoleClient,
}));
vi.mock("next/server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/server")>()),
  after: (cb: () => unknown) => {
    h.afterCallbacks.push(cb);
  },
}));
vi.mock("@/lib/history-log", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/history-log")>()),
  logEvent: h.logEvent,
}));

const BOOKING_ID = "33333333-3333-4333-8333-333333333333";
const owned = { host_id: "host-1", hosts: { id: "host-1", name: "Somchai", user_id: "user-1" } };

const booking = (over: Record<string, unknown> = {}) => ({
  id: BOOKING_ID,
  homestay_id: "homestay-1",
  status: "confirmed",
  total_price: 3000,
  amount_paid: 1000,
  ...over,
});

function mockClient(
  tables: Record<string, QueryResponse | QueryResponse[]> = {
    bookings: [{ data: booking() }, { data: null }],
    homestays: { data: owned },
  },
  user: { id: string } | null = { id: "user-1" },
) {
  h.createServerSupabaseClient.mockResolvedValue(createSupabaseMock({ user }));
  const supabase = createSupabaseMock({ tables });
  h.createServiceRoleClient.mockReturnValue(supabase);
  return supabase;
}

const post = async (payload: unknown) =>
  readJson(await POST(makeRequest("/api/bookings/host-cash-balance", { body: payload })));
const runAfter = async () => {
  for (const cb of h.afterCallbacks.splice(0)) await cb();
};

/** Whether the booking was written to at all. */
const updated = (supabase: ReturnType<typeof createSupabaseMock>) =>
  supabase.calls
    .filter((c) => c.table === "bookings")
    .some((c) => (c.builder.update as ReturnType<typeof vi.fn>).mock.calls.length > 0);

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  h.afterCallbacks.length = 0;
  h.logEvent.mockResolvedValue(undefined);
});

describe("POST /api/bookings/host-cash-balance", () => {
  it("records the balance as received in cash, in the host's name", async () => {
    const supabase = mockClient();

    const { status, body } = await post({ booking_id: BOOKING_ID });

    expect(status).toBe(200);
    expect(body).toEqual({ success: true, amount_paid: 3000 });
    expect(supabase.builderFor("bookings", 1).update).toHaveBeenCalledWith({
      amount_paid: 3000,
      payment_type: "full",
      updated_by: "Somchai",
    });
    expect(supabase.builderFor("bookings", 1).eq).toHaveBeenCalledWith("id", BOOKING_ID);
  });

  it("logs the cash payment as the host's act, with the amounts", async () => {
    mockClient();
    await post({ booking_id: BOOKING_ID });
    await runAfter();

    expect(h.logEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        entityId: BOOKING_ID,
        eventType: EventType.BALANCE_PAID,
        actorType: "host",
        actorId: "user-1",
        data: { method: "cash", previous_amount_paid: 1000, new_amount_paid: 3000, source: "host_dashboard" },
      }),
    );
  });

  it("refuses a visitor who is not signed in", async () => {
    const supabase = mockClient(undefined, null);
    expect((await post({ booking_id: BOOKING_ID })).status).toBe(401);
    expect(updated(supabase)).toBe(false);
  });

  // The booking id is not a secret (it is in the guest's email and was
  // searchable); only the homestay's own host may record cash for it.
  it("refuses a host who does not own the homestay", async () => {
    const supabase = mockClient({
      bookings: { data: booking() },
      homestays: { data: { ...owned, hosts: { ...owned.hosts, user_id: "someone-else" } } },
    });

    expect((await post({ booking_id: BOOKING_ID })).status).toBe(403);
    expect(updated(supabase)).toBe(false);
  });

  it("refuses a booking with nothing left to pay", async () => {
    const supabase = mockClient({ bookings: { data: booking({ amount_paid: 3000 }) }, homestays: { data: owned } });
    expect((await post({ booking_id: BOOKING_ID })).status).toBe(400);
    expect(updated(supabase)).toBe(false);
  });

  it.each(["pending", "cancelled"])("refuses a %s booking", async (status) => {
    const supabase = mockClient({ bookings: { data: booking({ status }) }, homestays: { data: owned } });
    expect((await post({ booking_id: BOOKING_ID })).status).toBe(400);
    expect(updated(supabase)).toBe(false);
  });

  it("refuses a request without a booking id", async () => {
    mockClient();
    expect((await post({})).status).toBe(400);
  });

  it("reports 404 for a booking that does not exist", async () => {
    mockClient({ bookings: { data: null }, homestays: { data: owned } });
    expect((await post({ booking_id: BOOKING_ID })).status).toBe(404);
  });

  it("reports 500 when the update fails", async () => {
    mockClient({ bookings: [{ data: booking() }, { error: { message: "boom" } }], homestays: { data: owned } });
    expect((await post({ booking_id: BOOKING_ID })).status).toBe(500);
  });
});

// Staff logins (migration 081): user-1 is not the owner here, only a staff row can let it in.
describe("POST /api/bookings/host-cash-balance: staff", () => {
  const staffed = { ...owned, hosts: { ...owned.hosts, user_id: "owner-9" } };

  it("lets staff of the host record the cash balance", async () => {
    const supabase = mockClient({
      bookings: [{ data: booking() }, { data: null }],
      homestays: { data: staffed },
      host_staff: { data: { id: "staff-row" } },
    });
    expect((await post({ booking_id: BOOKING_ID })).status).toBe(200);
    expect(updated(supabase)).toBe(true);
  });

  it("refuses a login that is not staff of this host", async () => {
    const supabase = mockClient({ bookings: { data: booking() }, homestays: { data: staffed }, host_staff: { data: null } });
    expect((await post({ booking_id: BOOKING_ID })).status).toBe(403);
    expect(updated(supabase)).toBe(false);
  });
});
