import { beforeEach, describe, expect, it, vi } from "vitest";
import { GET } from "./route";
import { signIn, signOut } from "../../../../../test/helpers/auth";
import { makeRequest, readJson } from "../../../../../test/helpers/request";

const mocks = vi.hoisted(() => ({
  createServerSupabaseClient: vi.fn(),
  createServiceRoleClient: vi.fn(),
  isAdmin: vi.fn(),
}));
vi.mock("@/lib/supabase/server", () => ({
  createServerSupabaseClient: mocks.createServerSupabaseClient,
  createServiceRoleClient: mocks.createServiceRoleClient,
}));
vi.mock("@/lib/admin", () => ({ isAdmin: mocks.isAdmin }));

const booking = {
  id: "b-1", homestay_id: "hs-1", room_id: "r-1", group_id: null,
  guest_name: "Somchai", guest_email: "s@example.com", guest_phone: "0812345678",
  check_in: "2026-11-20", check_out: "2026-11-21", num_guests: 2,
  total_price: 1500, status: "pending", payment_type: "full", amount_paid: 1500, created_at: "2026-11-18T03:00:00Z",
};

const get = (searchParams?: Record<string, string>) =>
  GET(makeRequest("/api/admin/bookings", { method: "GET", searchParams }));

const withBookings = () =>
  signIn(mocks, {
    tables: {
      bookings: [{ count: 1 }, { data: [booking] }],
      homestays: { data: [{ id: "hs-1", name: "Cozy Villa", slug: "cozy-villa" }] },
      rooms: { data: [{ id: "r-1", name: "Pine House" }] },
    },
  });

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("GET /api/admin/bookings", () => {
  it("lists bookings with homestay and house names", async () => {
    withBookings();
    const { status, body } = await readJson(await get());
    expect(status).toBe(200);
    expect(body).toMatchObject({ total: 1, data: [{ id: "b-1", homestay_name: "Cozy Villa", room_name: "Pine House" }] });
  });

  it("filters the count and the page by status", async () => {
    const sc = withBookings();
    await get({ status: "pending" });
    expect(sc.builderFor("bookings", 0).eq).toHaveBeenCalledWith("status", "pending");
    expect(sc.builderFor("bookings", 1).eq).toHaveBeenCalledWith("status", "pending");
  });

  it("refuses a status that is not a booking status", async () => {
    const sc = withBookings();
    const { status } = await readJson(await get({ status: "paid" }));
    expect(status).toBe(400);
    expect(sc.calls).toHaveLength(0);
  });

  it("searches guest name, email and phone with a cleaned, quoted term", async () => {
    const sc = withBookings();
    await get({ q: ' s@example.com"),status.eq.x ' });
    const expected =
      'guest_name.ilike."%s@example.comstatus.eq.x%",guest_email.ilike."%s@example.comstatus.eq.x%",guest_phone.ilike."%s@example.comstatus.eq.x%"';
    expect(sc.builderFor("bookings", 0).or).toHaveBeenCalledWith(expected);
    expect(sc.builderFor("bookings", 1).or).toHaveBeenCalledWith(expected);
  });

  it("ignores a search term too short to use", async () => {
    const sc = withBookings();
    await get({ q: "a" });
    expect(sc.builderFor("bookings", 1).or).not.toHaveBeenCalled();
  });

  it("refuses anyone who is not an admin", async () => {
    signOut(mocks);
    const { status } = await readJson(await get());
    expect(status).toBe(401);
  });

  it("returns a generic error when the query fails", async () => {
    signIn(mocks, { tables: { bookings: [{ count: 1 }, { error: { message: "boom" } }] } });
    const { status, body } = await readJson(await get());
    expect(status).toBe(500);
    expect(body).toEqual({ error: "Failed to fetch bookings" });
  });
});
