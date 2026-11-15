import { beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "./route";
import { createSupabaseMock } from "../../../../../test/helpers/supabase";
import { makeRequest, readJson, uniqueIp } from "../../../../../test/helpers/request";

const { createServiceRoleClient } = vi.hoisted(() => ({ createServiceRoleClient: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createServiceRoleClient }));

const { verifyTurnstileToken } = vi.hoisted(() => ({ verifyTurnstileToken: vi.fn() }));
vi.mock("@/lib/turnstile", () => ({ verifyTurnstileToken }));

const HOMESTAY_ID = "11111111-1111-4111-8111-111111111111";
const BOOKING_ID = "33333333-3333-4333-8333-333333333333";

const completed = (over: Record<string, unknown> = {}) => ({
  id: BOOKING_ID,
  guest_name: "Somchai Jaidee",
  guest_email: "Guest@Example.com",
  guest_phone: "0812345678",
  room_id: null,
  check_in: "2026-10-01",
  check_out: "2026-10-03",
  num_guests: 2,
  total_price: 3000,
  created_at: "2026-09-01T00:00:00Z",
  ...over,
});

const body = (over: Record<string, unknown> = {}) => ({
  homestay_id: HOMESTAY_ID,
  phone: "0812345678",
  email: "guest@example.com",
  turnstileToken: "tok",
  ...over,
});

const lookup = (payload: unknown, ip = uniqueIp()) =>
  POST(makeRequest("/api/reviews/lookup", { body: payload, ip }));

function mockClient(rows: unknown[]) {
  const supabase = createSupabaseMock({ tables: { bookings: { data: rows }, reviews: { data: [] } } });
  createServiceRoleClient.mockReturnValue(supabase);
  return supabase;
}

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  verifyTurnstileToken.mockReset();
  verifyTurnstileToken.mockResolvedValue("pass");
  createServiceRoleClient.mockReset();
});

describe("POST /api/reviews/lookup", () => {
  it("returns the stay to review when phone and email both match", async () => {
    mockClient([completed()]);

    const { status, body: result } = await readJson(await lookup(body()));

    expect(status).toBe(200);
    expect(result).toMatchObject({ bookings: [{ id: BOOKING_ID, guest_name: "Somchai Jaidee" }] });
  });

  // The leak: "%@%" contained an @, went to ilike untouched, and matched every
  // completed booking of the homestay.
  it.each([
    { identifier: "%@%" },
    { email: "%@%", phone: "0812345678" },
    { email: "*@*", phone: "0812345678" },
  ])("refuses the wildcard lookup %j without reading any booking", async (fields) => {
    mockClient([completed()]);

    const { status } = await readJson(await lookup({ homestay_id: HOMESTAY_ID, turnstileToken: "tok", ...fields }));

    expect(status).toBe(400);
    expect(createServiceRoleClient).not.toHaveBeenCalled();
  });

  it("refuses an email on its own", async () => {
    mockClient([completed()]);
    const { status } = await readJson(await lookup({ homestay_id: HOMESTAY_ID, email: "guest@example.com" }));
    expect(status).toBe(400);
  });

  it("drops a stay whose phone does not match", async () => {
    mockClient([completed({ guest_phone: "0899999999" })]);

    const { body: result } = await readJson(await lookup(body()));

    expect(result).toEqual({ bookings: [] });
  });

  it("drops a row that only matched because `_` is a LIKE wildcard", async () => {
    mockClient([completed({ guest_email: "aXb@example.com" })]);

    const { body: result } = await readJson(await lookup(body({ email: "a_b@example.com" })));

    expect(result).toEqual({ bookings: [] });
  });

  it("refuses a request Turnstile rejects", async () => {
    verifyTurnstileToken.mockResolvedValue("fail");
    mockClient([completed()]);

    const { status } = await readJson(await lookup(body()));

    expect(status).toBe(403);
  });

  it("rate-limits one address", async () => {
    mockClient([completed()]);
    const ip = uniqueIp();
    for (let i = 0; i < 10; i++) {
      expect((await lookup(body(), ip)).status).toBe(200);
    }
    expect((await lookup(body(), ip)).status).toBe(429);
  });
});
