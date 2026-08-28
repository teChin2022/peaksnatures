import { beforeEach, describe, expect, it, vi } from "vitest";
import { GET } from "./route";
import { createSupabaseMock } from "../../../../../test/helpers/supabase";
import { makeRequest, readJson } from "../../../../../test/helpers/request";

const { createServiceRoleClient } = vi.hoisted(() => ({ createServiceRoleClient: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createServiceRoleClient }));
// Run the cached loader inline so the query is observable.
vi.mock("next/cache", () => ({ unstable_cache: (fn: () => unknown) => fn }));

const ranges = [{ id: "b-1", room_id: "room-1", check_in: "2026-06-01", check_out: "2026-06-03" }];

const get = (searchParams?: Record<string, string>) =>
  GET(makeRequest("/api/bookings/availability", { method: "GET", searchParams }));

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  createServiceRoleClient.mockReturnValue(createSupabaseMock({ tables: { bookings: { data: ranges } } }));
});

describe("GET /api/bookings/availability", () => {
  it("returns the homestay's occupied ranges", async () => {
    await expect(readJson(await get({ homestay_id: "homestay-1" }))).resolves.toEqual({
      status: 200,
      body: { bookedRanges: ranges },
    });
  });

  it("counts only bookings that actually hold a room", async () => {
    const supabase = createSupabaseMock({ tables: { bookings: { data: ranges } } });
    createServiceRoleClient.mockReturnValue(supabase);

    await get({ homestay_id: "homestay-1" });

    const builder = supabase.builderFor("bookings");
    expect(builder.eq).toHaveBeenCalledWith("homestay_id", "homestay-1");
    expect(builder.in).toHaveBeenCalledWith("status", ["pending", "confirmed", "verified"]);
  });

  it("lets the CDN cache the answer for a minute", async () => {
    const response = await get({ homestay_id: "homestay-1" });
    expect(response.headers.get("Cache-Control")).toBe("public, s-maxage=60, stale-while-revalidate=300");
  });

  it("requires a homestay", async () => {
    await expect(readJson(await get())).resolves.toEqual({
      status: 400,
      body: { error: "homestay_id is required" },
    });
  });

  it("returns an empty list when the homestay has no bookings", async () => {
    createServiceRoleClient.mockReturnValue(createSupabaseMock({ tables: { bookings: { data: null } } }));
    expect((await readJson(await get({ homestay_id: "homestay-1" }))).body).toEqual({ bookedRanges: [] });
  });

  it("reports 500 when the lookup fails", async () => {
    createServiceRoleClient.mockReturnValue(
      createSupabaseMock({ tables: { bookings: { data: null, error: { message: "boom" } } } }),
    );

    await expect(readJson(await get({ homestay_id: "homestay-1" }))).resolves.toEqual({
      status: 500,
      body: { error: "Failed to fetch availability" },
    });
  });
});
