import { beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "./route";
import { createSupabaseMock, type SupabaseMockOptions } from "../../../../../test/helpers/supabase";
import { makeRequest, uniqueIp } from "../../../../../test/helpers/request";

const { createServiceRoleClient } = vi.hoisted(() => ({ createServiceRoleClient: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createServiceRoleClient }));

const HOMESTAY_ID = "11111111-1111-4111-8111-111111111111";
const ROOM_ID = "22222222-2222-4222-8222-222222222222";

const body = (over: Record<string, unknown> = {}) => ({
  homestay_id: HOMESTAY_ID,
  guest_phone: "0812345678",
  guest_email: "Guest@Example.COM",
  guest_name: "Somchai Jaidee",
  guest_province: "chiang_mai",
  guest_note: "late check-in",
  check_in: "2026-06-01",
  check_out: "2026-06-03",
  lines: [{ room_id: ROOM_ID, num_guests: 2, tier_ids: [], option_ids: [] }],
  ...over,
});

const save = (payload: unknown) =>
  POST(makeRequest("/api/bookings/draft", { body: payload, ip: uniqueIp() }));

function mockClient(hours: number | null, over: SupabaseMockOptions = {}) {
  const supabase = createSupabaseMock({
    tables: { homestays: { data: hours === null ? null : { hosts: { booking_draft_hours: hours } } } },
    ...over,
  });
  createServiceRoleClient.mockReturnValue(supabase);
  return supabase;
}

const draftCalls = (supabase: ReturnType<typeof createSupabaseMock>) =>
  supabase.calls.filter((c) => c.table === "booking_drafts");

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("POST /api/bookings/draft", () => {
  it("stores the snapshot with the phone and email normalised", async () => {
    const supabase = mockClient(24);

    const res = await save(body());

    expect(res.status).toBe(204);
    const upsert = supabase.builderFor("booking_drafts").upsert as ReturnType<typeof vi.fn>;
    expect(upsert).toHaveBeenCalledTimes(1);
    const [row, opts] = upsert.mock.calls[0];
    expect(row.guest_phone).toBe("0812345678");
    expect(row.guest_email).toBe("guest@example.com");
    expect(opts).toEqual({ onConflict: "homestay_id,guest_phone,guest_email" });
  });

  it("normalises a phone typed with separators", async () => {
    const supabase = mockClient(24);
    await save(body({ guest_phone: "081-234-5678" }));
    const upsert = supabase.builderFor("booking_drafts").upsert as ReturnType<typeof vi.fn>;
    expect(upsert.mock.calls[0][0].guest_phone).toBe("0812345678");
  });

  it("records the guest's name in the audit columns", async () => {
    const supabase = mockClient(24);
    await save(body());
    const row = (supabase.builderFor("booking_drafts").upsert as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(row.created_by).toBe("Somchai Jaidee");
    expect(row.updated_by).toBe("Somchai Jaidee");
  });

  // Stamped at write time so the lookup filter and the nightly sweep share one
  // predicate. If this drifts, a draft can be visible but already swept, or
  // swept but still served.
  it("stamps expires_at from the host's retention window", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-01T10:00:00Z"));

    const supabase = mockClient(6);
    await save(body());

    const row = (supabase.builderFor("booking_drafts").upsert as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(row.expires_at).toBe("2026-05-01T16:00:00.000Z");
    vi.useRealTimers();
  });

  // 0 means the host turned the feature off. Nothing may be written — this is
  // the whole privacy promise of the setting.
  it("writes nothing at all when the host has the feature off", async () => {
    const supabase = mockClient(0);

    const res = await save(body());

    expect(res.status).toBe(204);
    expect(draftCalls(supabase)).toHaveLength(0);
  });

  it("writes nothing when the homestay cannot be resolved", async () => {
    const supabase = mockClient(null);
    await save(body());
    expect(draftCalls(supabase)).toHaveLength(0);
  });

  it("rejects a phone that is not ten digits, without writing", async () => {
    const supabase = mockClient(24);
    const res = await save(body({ guest_phone: "081234" }));
    expect(res.status).toBe(204);
    expect(draftCalls(supabase)).toHaveLength(0);
  });

  it("rejects a cart larger than the cap, without writing", async () => {
    const supabase = mockClient(24);
    const lines = Array.from({ length: 13 }, () => ({
      room_id: ROOM_ID, num_guests: 2, tier_ids: [], option_ids: [],
    }));
    await save(body({ lines }));
    expect(draftCalls(supabase)).toHaveLength(0);
  });

  it("rejects a check-out that is not after check-in", async () => {
    const supabase = mockClient(24);
    await save(body({ check_in: "2026-06-03", check_out: "2026-06-03" }));
    expect(draftCalls(supabase)).toHaveLength(0);
  });

  // Fire-and-forget: the booking page must never see an error from this.
  it("still answers 204 when the write fails", async () => {
    mockClient(24, {
      tables: {
        homestays: { data: { hosts: { booking_draft_hours: 24 } } },
        booking_drafts: { error: { message: "boom" } },
      },
    });

    const res = await save(body());

    expect(res.status).toBe(204);
  });

  it("answers 204 on malformed JSON rather than surfacing a 400", async () => {
    mockClient(24);
    const req = makeRequest("/api/bookings/draft", { body: "not json", ip: uniqueIp() });
    expect((await POST(req)).status).toBe(204);
  });
});
