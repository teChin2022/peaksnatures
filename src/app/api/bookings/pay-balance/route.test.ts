import { beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "./route";
import { createSupabaseMock, type QueryResponse } from "../../../../../test/helpers/supabase";
import { makeRequest, readJson } from "../../../../../test/helpers/request";

const h = vi.hoisted(() => ({
  createServiceRoleClient: vi.fn(),
  claimVerifiedSlip: vi.fn(),
  releaseVerifiedSlip: vi.fn(),
  getHostBlockState: vi.fn(),
  isHostBlocked: vi.fn(),
  logEvent: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({ createServiceRoleClient: h.createServiceRoleClient }));
vi.mock("@/lib/verified-slips", () => ({
  claimVerifiedSlip: h.claimVerifiedSlip,
  releaseVerifiedSlip: h.releaseVerifiedSlip,
}));
vi.mock("@/lib/billing", () => ({ getHostBlockState: h.getHostBlockState }));
vi.mock("@/lib/plan-expiry", () => ({ isHostBlocked: h.isHostBlocked }));
vi.mock("@/lib/history-log", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/history-log")>()),
  logEvent: h.logEvent,
}));
vi.mock("next/server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/server")>()),
  after: () => {},
}));

const BOOKING_ID = "33333333-3333-4333-8333-333333333333";
const HASH = "a".repeat(64);

const booking = (over: Record<string, unknown> = {}) => ({
  id: BOOKING_ID,
  status: "confirmed",
  guest_name: "Nok Suwan",
  guest_email: "Guest@Example.com",
  total_price: 3000,
  amount_paid: 1000,
  payment_type: "deposit",
  homestay_id: "homestay-1",
  ...over,
});

const body = (over: Record<string, unknown> = {}) => ({
  booking_id: BOOKING_ID,
  guest_email: "guest@example.com",
  method: "transfer",
  slip_hash: HASH,
  ...over,
});

function mockClient(row: unknown = booking(), update: QueryResponse = { data: null }) {
  const supabase = createSupabaseMock({
    tables: {
      bookings: [{ data: row }, update],
      homestays: {
        data: { host_id: "host-1", hosts: { promptpay_id: "0812345678", bank_account_number: null } },
      },
    },
  });
  h.createServiceRoleClient.mockReturnValue(supabase);
  return supabase;
}

const pay = async (payload: unknown) =>
  readJson(await POST(makeRequest("/api/bookings/pay-balance", { body: payload })));

/** The UPDATE that settles the booking, if one was sent. */
const settled = (supabase: ReturnType<typeof createSupabaseMock>) =>
  supabase.calls
    .filter((c) => c.table === "bookings")
    .some((c) => (c.builder.update as ReturnType<typeof vi.fn>).mock.calls.length > 0);

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  h.claimVerifiedSlip.mockReset();
  h.claimVerifiedSlip.mockResolvedValue(true);
  h.releaseVerifiedSlip.mockResolvedValue(undefined);
  h.getHostBlockState.mockResolvedValue({ plan_type: "commission" });
  h.isHostBlocked.mockReturnValue(false);
  h.logEvent.mockResolvedValue(undefined);
});

describe("POST /api/bookings/pay-balance", () => {
  it("settles the balance when the server's slip record shows the balance due, paid to this host", async () => {
    const supabase = mockClient();

    const { status, body: result } = await pay(body());

    expect(status).toBe(200);
    expect(result).toEqual({ success: true, amount_paid: 3000, balance_due: 0 });
    expect(h.claimVerifiedSlip).toHaveBeenCalledWith(expect.anything(), {
      slipHash: HASH,
      amount: 2000,
      promptpayId: "0812345678",
      bankAccountNumber: null,
    });
    expect(supabase.builderFor("bookings", 1).update).toHaveBeenCalledWith(
      expect.objectContaining({ amount_paid: 3000, payment_type: "full" }),
    );
  });

  // F-05: any non-empty string used to pass as a slip.
  it("refuses a slip the server cannot match, and settles nothing", async () => {
    const supabase = mockClient();
    h.claimVerifiedSlip.mockResolvedValue(false);

    const { status, body: result } = await pay(body({ slip_hash: "made-up" }));

    expect(status).toBe(400);
    expect(result).toMatchObject({ error: "SLIP_NOT_VERIFIED" });
    expect(settled(supabase)).toBe(false);
  });

  // F-05: the guest used to mark their own balance paid in cash. The host now
  // records cash at the homestay (/api/bookings/host-cash-balance).
  it("refuses a guest declaring the balance paid in cash", async () => {
    const supabase = mockClient();

    const { status } = await pay(body({ method: "cash", slip_hash: undefined }));

    expect(status).toBe(400);
    expect(h.claimVerifiedSlip).not.toHaveBeenCalled();
    expect(settled(supabase)).toBe(false);
  });

  it("refuses a transfer with no slip", async () => {
    mockClient();
    expect((await pay(body({ slip_hash: undefined }))).status).toBe(400);
    expect(h.claimVerifiedSlip).not.toHaveBeenCalled();
  });

  it("refuses an email that is not the booking's, before touching the slip", async () => {
    mockClient();
    expect((await pay(body({ guest_email: "someone@else.com" }))).status).toBe(403);
    expect(h.claimVerifiedSlip).not.toHaveBeenCalled();
  });

  it("refuses a booking with nothing left to pay, before touching the slip", async () => {
    mockClient(booking({ amount_paid: 3000 }));
    expect((await pay(body())).status).toBe(400);
    expect(h.claimVerifiedSlip).not.toHaveBeenCalled();
  });

  it("frees the slip again when the booking could not be updated", async () => {
    mockClient(booking(), { error: { message: "boom" } });

    expect((await pay(body())).status).toBe(500);
    expect(h.releaseVerifiedSlip).toHaveBeenCalledWith(expect.anything(), HASH);
  });
});
