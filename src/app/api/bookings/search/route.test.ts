import { beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "./route";
import { createSupabaseMock, type SupabaseMockOptions } from "../../../../../test/helpers/supabase";
import { makeRequest, readJson, uniqueIp } from "../../../../../test/helpers/request";

const { createServiceRoleClient } = vi.hoisted(() => ({ createServiceRoleClient: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createServiceRoleClient }));

const HOMESTAY_ID = "11111111-1111-4111-8111-111111111111";

const booking = (over: Record<string, unknown> = {}) => ({
  id: "33333333-3333-4333-8333-333333333333",
  guest_name: "Somchai Jaidee",
  guest_email: "Guest@Example.com",
  guest_phone: "0812345678",
  check_in: "2026-12-10",
  check_out: "2026-12-12",
  num_guests: 2,
  total_price: 3000,
  amount_paid: 3000,
  payment_type: "full",
  status: "confirmed",
  room_id: null,
  group_id: null,
  checked_in_at: null,
  checked_out_at: null,
  created_at: "2026-11-01T00:00:00Z",
  selected_options: null,
  ...over,
});

const body = (over: Record<string, unknown> = {}) => ({
  homestay_id: HOMESTAY_ID,
  phone: "081-234-5678",
  email: " guest@example.COM ",
  ...over,
});

const search = (payload: unknown, ip = uniqueIp()) =>
  POST(makeRequest("/api/bookings/search", { body: payload, ip }));

function mockClient(rows: unknown[], options: SupabaseMockOptions = {}) {
  const supabase = createSupabaseMock({
    ...options,
    tables: {
      bookings: { data: rows },
      homestays: { data: { hosts: { cancellation_days: 3 } } },
      ...options.tables,
    },
  });
  createServiceRoleClient.mockReturnValue(supabase);
  return supabase;
}

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  createServiceRoleClient.mockReset();
});

describe("POST /api/bookings/search", () => {
  it("returns the guest's booking when phone and email both match", async () => {
    mockClient([booking()]);

    const { status, body: result } = await readJson(await search(body()));

    expect(status).toBe(200);
    expect(result).toMatchObject({
      cancellation_days: 3,
      bookings: [{ id: "33333333-3333-4333-8333-333333333333", room_name: "—", has_review: false }],
    });
  });

  it("narrows the database read to this homestay and this email", async () => {
    const supabase = mockClient([booking()]);

    await search(body());

    const q = supabase.builderFor("bookings");
    expect(q.eq).toHaveBeenCalledWith("homestay_id", HOMESTAY_ID);
    expect(q.ilike).toHaveBeenCalledWith("guest_email", "guest@example.com");
    expect(q.like).not.toHaveBeenCalled();
  });

  // The leak this route used to have: "-------" passed the phone check, lost
  // every character to the digit strip, and became LIKE '%%', which matches
  // every booking of the homestay.
  it.each(["-------", "( ) ( )", "+++++++"])("refuses %j without reading any booking", async (phone) => {
    mockClient([booking()]);

    const { status, body: result } = await readJson(await search(body({ phone })));

    expect(status).toBe(400);
    expect(result).toEqual({ error: "INVALID_INPUT" });
    expect(createServiceRoleClient).not.toHaveBeenCalled();
  });

  it("refuses a phone on its own", async () => {
    mockClient([booking()]);
    const { status } = await readJson(await search({ homestay_id: HOMESTAY_ID, phone: "0812345678" }));
    expect(status).toBe(400);
  });

  it("refuses an email on its own", async () => {
    mockClient([booking()]);
    const { status } = await readJson(await search({ homestay_id: HOMESTAY_ID, email: "guest@example.com" }));
    expect(status).toBe(400);
  });

  it.each(["%@%", "*@*"])("refuses the wildcard email %j", async (email) => {
    mockClient([booking()]);
    const { status } = await readJson(await search(body({ email })));
    expect(status).toBe(400);
    expect(createServiceRoleClient).not.toHaveBeenCalled();
  });

  it("drops a booking whose email matches but whose phone does not", async () => {
    mockClient([booking({ guest_phone: "0899999999" })]);

    const { body: result } = await readJson(await search(body()));

    expect(result).toMatchObject({ bookings: [] });
  });

  // `_` is the one LIKE wildcard an email may legally contain, so ilike can
  // hand back a near miss. The exact comparison afterwards must drop it.
  it("drops a row that only matched because `_` is a LIKE wildcard", async () => {
    mockClient([booking({ guest_email: "aXb@example.com" })]);

    const { body: result } = await readJson(await search(body({ email: "a_b@example.com" })));

    expect(result).toMatchObject({ bookings: [] });
  });

  it("finds a host-entered booking whose phone was stored with dashes", async () => {
    mockClient([booking({ guest_phone: "081-234-5678" })]);

    const { body: result } = await readJson(await search(body({ phone: "0812345678" })));

    expect(result).toMatchObject({ bookings: [{ id: "33333333-3333-4333-8333-333333333333" }] });
  });

  it("rate-limits one address", async () => {
    mockClient([booking()]);
    const ip = uniqueIp();
    for (let i = 0; i < 10; i++) {
      expect((await search(body(), ip)).status).toBe(200);
    }
    expect((await search(body(), ip)).status).toBe(429);
  });
});
