import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextResponse } from "next/server";
import { POST } from "./route";
import { createSupabaseMock, type QueryResponse } from "../../../../../test/helpers/supabase";
import { makeRequest, readJson } from "../../../../../test/helpers/request";

const h = vi.hoisted(() => ({
  createServiceRoleClient: vi.fn(),
  claimVerifiedSlip: vi.fn(),
  releaseVerifiedSlip: vi.fn(),
  rateLimitCheck: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({ createServiceRoleClient: h.createServiceRoleClient }));
vi.mock("@/lib/verified-slips", () => ({
  claimVerifiedSlip: h.claimVerifiedSlip,
  releaseVerifiedSlip: h.releaseVerifiedSlip,
}));
vi.mock("@/lib/rate-limit", () => ({ createRateLimiter: () => ({ check: h.rateLimitCheck }) }));
vi.mock("@/lib/notifications", () => ({
  sendDateChangeLineNotification: vi.fn(),
  sendDateChangeSmsNotification: vi.fn(),
  dispatchHostNotification: vi.fn(),
  buildDateChangeMessage: vi.fn(),
}));
vi.mock("@/lib/history-log", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/history-log")>()),
  logEvent: vi.fn(),
}));
vi.mock("next/server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/server")>()),
  after: () => {},
}));

const BOOKING_ID = "33333333-3333-4333-8333-333333333333";
const ROOM_ID = "44444444-4444-4444-8444-444444444444";
const HASH = "a".repeat(64);

const booking = (over: Record<string, unknown> = {}) => ({
  id: BOOKING_ID,
  homestay_id: "homestay-1",
  room_id: ROOM_ID,
  status: "confirmed",
  checked_in_at: null,
  guest_name: "Nok Suwan",
  guest_email: "Guest@Example.com",
  check_in: "2026-12-10",
  check_out: "2026-12-12",
  total_price: 3000,
  amount_paid: 3000,
  payment_type: "full",
  selected_options: [],
  guest_pricing_surcharge: 0,
  discount_amount: 0,
  ...over,
});

/** Two nights to three at 1,500 a night: 1,500 more to pay. */
const body = (over: Record<string, unknown> = {}) => ({
  booking_id: BOOKING_ID,
  guest_email: "guest@example.com",
  new_check_in: "2026-12-10",
  new_check_out: "2026-12-13",
  slip_hash: HASH,
  ...over,
});

function mockClient(row: unknown = booking(), insert: QueryResponse = { data: { id: "dcr-1" } }) {
  const supabase = createSupabaseMock({
    tables: {
      bookings: [{ data: row }, { data: [] }],
      date_change_requests: [{ data: [] }, { data: [] }, insert],
      rooms: { data: { quantity: 1, price_per_night: 1500 } },
      blocked_dates: { data: [] },
      booking_holds: { data: [] },
      room_seasonal_prices: { data: [] },
      room_special_prices: { data: [] },
      homestays: { data: { hosts: { promptpay_id: "0812345678", bank_account_number: null } } },
    },
  });
  h.createServiceRoleClient.mockReturnValue(supabase);
  return supabase;
}

const post = async (payload: unknown) =>
  readJson(await POST(makeRequest("/api/bookings/change-dates", { body: payload })));

/** What the request row was written with, if it was. */
const inserted = (supabase: ReturnType<typeof createSupabaseMock>) =>
  (supabase.builderFor("date_change_requests", 2).insert as ReturnType<typeof vi.fn>).mock.calls[0]?.[0] as
    | Record<string, unknown>
    | undefined;

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  h.rateLimitCheck.mockResolvedValue(null);
  h.claimVerifiedSlip.mockReset();
  h.claimVerifiedSlip.mockResolvedValue(true);
  h.releaseVerifiedSlip.mockResolvedValue(undefined);
});

describe("POST /api/bookings/change-dates", () => {
  it("files the request with the slip marked verified when the server's record matches", async () => {
    const supabase = mockClient();

    const { status } = await post(body());

    expect(status).toBe(201);
    expect(h.claimVerifiedSlip).toHaveBeenCalledWith(expect.anything(), {
      slipHash: HASH,
      amount: 1500,
      promptpayId: "0812345678",
      bankAccountNumber: null,
    });
    expect(inserted(supabase)).toMatchObject({ additional_payment: 1500, easyslip_verified: true, slip_hash: HASH });
  });

  // F-06: the client's own "verified" used to be stored, and the host saw a
  // paid difference that was never paid.
  it("marks the slip unverified when the server cannot match it, whatever the client says", async () => {
    const supabase = mockClient();
    h.claimVerifiedSlip.mockResolvedValue(false);

    await post(body({ easyslip_verified: true }));

    expect(inserted(supabase)).toMatchObject({ easyslip_verified: false });
  });

  // F-06: the booking id alone used to be enough to file a change for anyone.
  it("refuses an email that is not the booking's, before anything is filed", async () => {
    const supabase = mockClient();

    const { status } = await post(body({ guest_email: "someone@else.com" }));

    expect(status).toBe(403);
    expect(h.claimVerifiedSlip).not.toHaveBeenCalled();
    expect(supabase.calls.filter((c) => c.table === "date_change_requests")).toHaveLength(0);
  });

  it("refuses a request without the guest's email", async () => {
    mockClient();
    const { guest_email: _omit, ...rest } = body();
    void _omit;
    expect((await post(rest)).status).toBe(400);
  });

  it("refuses the price preview to a stranger too", async () => {
    mockClient();
    expect((await post(body({ preview: true, guest_email: "someone@else.com" }))).status).toBe(403);
  });

  it("frees the slip again when the request could not be saved", async () => {
    mockClient(booking(), { error: { message: "boom" } });

    expect((await post(body())).status).toBe(500);
    expect(h.releaseVerifiedSlip).toHaveBeenCalledWith(expect.anything(), HASH);
  });

  it("answers 429 from the rate limiter before reading the booking", async () => {
    const supabase = mockClient();
    h.rateLimitCheck.mockResolvedValue(NextResponse.json({ error: "Too many requests" }, { status: 429 }));

    expect((await post(body())).status).toBe(429);
    expect(supabase.from).not.toHaveBeenCalled();
  });
});
