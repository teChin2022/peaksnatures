import { beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "./route";
import { createSupabaseMock, type SupabaseMockOptions } from "../../../../../../test/helpers/supabase";
import { makeRequest, readJson, uniqueIp } from "../../../../../../test/helpers/request";

const { createServiceRoleClient } = vi.hoisted(() => ({ createServiceRoleClient: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createServiceRoleClient }));

const { verifyTurnstileToken } = vi.hoisted(() => ({ verifyTurnstileToken: vi.fn() }));
vi.mock("@/lib/turnstile", () => ({ verifyTurnstileToken }));

const HOMESTAY_ID = "11111111-1111-4111-8111-111111111111";
const ROOM_ID = "22222222-2222-4222-8222-222222222222";

const row = (over: Record<string, unknown> = {}) => ({
  check_in: "2026-09-10",
  check_out: "2026-09-12",
  guest_email: "guest@example.com",
  updated_at: "2026-09-01T04:00:00.000Z",
  payload: {
    v: 1,
    guest: { name: "Somchai Jaidee", province: "chiang_mai", note: "late check-in" },
    lines: [{ room_id: ROOM_ID, num_guests: 2, tier_ids: [], option_ids: [] }],
    promo_code: "SOMMAI10",
    payment_option: "full",
    subtotal_at_save: 4500,
    locale: "th",
  },
  ...over,
});

const body = (over: Record<string, unknown> = {}) => ({
  homestay_id: HOMESTAY_ID,
  phone: "0812345678",
  email: "Guest@Example.COM",
  turnstileToken: "tok",
  ...over,
});

const lookup = (payload: unknown) =>
  POST(makeRequest("/api/bookings/draft/lookup", { body: payload, ip: uniqueIp() }));

function mockClient(options: SupabaseMockOptions = {}) {
  const supabase = createSupabaseMock(options);
  createServiceRoleClient.mockReturnValue(supabase);
  return supabase;
}

const found = (over: Record<string, unknown> = {}) => ({ tables: { booking_drafts: { data: row(over) } } });

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  verifyTurnstileToken.mockResolvedValue("pass");
  vi.useFakeTimers();
  // 2026-09-01 in Bangkok.
  vi.setSystemTime(new Date("2026-09-01T03:00:00Z"));
});

describe("POST /api/bookings/draft/lookup", () => {
  it("returns the saved form for a matching phone and email", async () => {
    mockClient(found());

    const { status, body: result } = await readJson(await lookup(body()));

    expect(status).toBe(200);
    expect(result).toEqual({
      found: true,
      check_in: "2026-09-10",
      check_out: "2026-09-12",
      guest: { name: "Somchai Jaidee", email: "guest@example.com", province: "chiang_mai", note: "late check-in" },
      lines: [{ room_id: ROOM_ID, num_guests: 2, tier_ids: [], option_ids: [] }],
      promo_code: "SOMMAI10",
      payment_option: "full",
      subtotal_at_save: 4500,
      saved_at: "2026-09-01T04:00:00.000Z",
    });
  });

  // The response is assembled field by field. Pinning the key set means a later
  // `...draft` spread cannot quietly start leaking the row id, homestay_id,
  // guest_phone or expires_at.
  it("returns exactly the intended keys and nothing else", async () => {
    mockClient(found());
    const { body: result } = await readJson(await lookup(body()));
    expect(Object.keys(result as object).sort()).toEqual([
      "check_in", "check_out", "found", "guest", "lines",
      "payment_option", "promo_code", "saved_at", "subtotal_at_save",
    ]);
    expect(Object.keys((result as { guest: object }).guest).sort()).toEqual(
      ["email", "name", "note", "province"],
    );
  });

  it("scopes the query to the homestay, phone and email, and to unexpired rows", async () => {
    const supabase = mockClient(found());

    await lookup(body({ phone: "081-234-5678" }));

    const q = supabase.builderFor("booking_drafts");
    expect(q.eq).toHaveBeenCalledWith("homestay_id", HOMESTAY_ID);
    expect(q.eq).toHaveBeenCalledWith("guest_phone", "0812345678");
    expect(q.eq).toHaveBeenCalledWith("guest_email", "guest@example.com");
    expect(q.gt).toHaveBeenCalledWith("expires_at", "2026-09-01T03:00:00.000Z");
    // Never `like` — the %digits% match in /api/bookings/search is an
    // enumeration hole and must not be copied here.
    expect(q.like).not.toHaveBeenCalled();
  });

  // A wrong email produces no row, exactly like an unknown phone. Both must
  // answer identically or this endpoint becomes a phone-enumeration oracle.
  it("answers a wrong email byte-for-byte the same as an unknown phone", async () => {
    mockClient({ tables: { booking_drafts: { data: null } } });
    const wrongEmail = await readJson(await lookup(body({ email: "someone@else.com" })));

    mockClient({ tables: { booking_drafts: { data: null } } });
    const unknownPhone = await readJson(await lookup(body({ phone: "0899999999" })));

    expect(wrongEmail).toEqual({ status: 200, body: { found: false } });
    expect(wrongEmail).toEqual(unknownPhone);
  });

  // Bangkok is UTC+7, so at 18:00 UTC on 1 Sep it is already 2 Sep locally and
  // a 1 Sep check-in has passed. A UTC-derived "today" would compute 2026-09-01
  // and wrongly restore it — neither acquire_booking_hold nor
  // create_booking_atomic would catch that.
  it("refuses a draft whose check-in has passed on the Bangkok calendar", async () => {
    vi.setSystemTime(new Date("2026-09-01T18:00:00Z"));
    mockClient(found({ check_in: "2026-09-01", check_out: "2026-09-03" }));

    const { status, body: result } = await readJson(await lookup(body()));

    expect(status).toBe(200);
    expect(result).toEqual({ found: false });
  });

  it("still restores a draft checking in today in Bangkok", async () => {
    vi.setSystemTime(new Date("2026-09-01T18:00:00Z")); // 2026-09-02 in Bangkok
    mockClient(found({ check_in: "2026-09-02", check_out: "2026-09-04" }));

    const { body: result } = await readJson(await lookup(body()));

    expect((result as { found: boolean }).found).toBe(true);
  });

  it("answers 200 with found:false for a miss, never 404", async () => {
    mockClient({ tables: { booking_drafts: { data: null } } });
    const { status, body: result } = await readJson(await lookup(body()));
    expect(status).toBe(200);
    expect(result).toEqual({ found: false });
  });

  it("treats a malformed phone as a miss rather than an error", async () => {
    const supabase = mockClient(found());
    const { status, body: result } = await readJson(await lookup(body({ phone: "0812" })));
    expect(status).toBe(200);
    expect(result).toEqual({ found: false });
    expect(supabase.calls.filter((c) => c.table === "booking_drafts")).toHaveLength(0);
  });

  it("hides a database error behind the same miss response", async () => {
    mockClient({ tables: { booking_drafts: { error: { message: "boom" } } } });
    const { status, body: result } = await readJson(await lookup(body()));
    expect(status).toBe(200);
    expect(result).toEqual({ found: false });
  });

  it("blocks a failed CAPTCHA before touching the database", async () => {
    verifyTurnstileToken.mockResolvedValue("fail");
    const supabase = mockClient(found());

    const { status } = await readJson(await lookup(body()));

    expect(status).toBe(403);
    expect(supabase.from).not.toHaveBeenCalled();
  });

  // Turnstile fails open everywhere in this codebase: Cloudflare being
  // unreachable must never lock a guest out of their own booking.
  it("proceeds when Turnstile is unconfigured or unreachable", async () => {
    verifyTurnstileToken.mockResolvedValue("skip");
    mockClient(found());

    const { status, body: result } = await readJson(await lookup(body()));

    expect(status).toBe(200);
    expect((result as { found: boolean }).found).toBe(true);
  });

  it("rejects a request missing the homestay", async () => {
    mockClient(found());
    const { status } = await readJson(await lookup({ phone: "0812345678", email: "a@b.com" }));
    expect(status).toBe(400);
  });

  it("never caches the response", async () => {
    mockClient(found());
    const res = await lookup(body());
    expect(res.headers.get("Cache-Control")).toBe("private, no-store");
  });
});
