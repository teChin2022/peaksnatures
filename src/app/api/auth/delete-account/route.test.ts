import { beforeEach, describe, expect, it, vi } from "vitest";
import { DELETE } from "./route";
import { createSupabaseMock, type QueryResponse } from "../../../../../test/helpers/supabase";
import { makeRequest, readJson } from "../../../../../test/helpers/request";

const h = vi.hoisted(() => ({
  createServerSupabaseClient: vi.fn(),
  createServiceRoleClient: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createServerSupabaseClient: h.createServerSupabaseClient,
  createServiceRoleClient: h.createServiceRoleClient,
}));

function mockClients(tables: Record<string, QueryResponse | QueryResponse[]>, userId = "owner-1") {
  h.createServerSupabaseClient.mockResolvedValue(
    createSupabaseMock({ user: { id: userId, email: "someone@example.com" } as { id: string } }),
  );
  const sc = createSupabaseMock({ tables: { platform_admins: {}, homestays: {}, login_otps: {}, ...tables } });
  h.createServiceRoleClient.mockReturnValue(sc);
  return sc;
}

const del = async () => readJson(await DELETE(makeRequest("/api/auth/delete-account", { method: "DELETE", body: {} })));

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("DELETE /api/auth/delete-account", () => {
  // The host delete cascades host_staff rows (migration 081) but not the auth
  // users behind them, which would be left able to sign in.
  it("deletes the owner's staff logins before the host", async () => {
    const sc = mockClients({
      hosts: [{ data: { id: "host-1", security_pin_hash: null } }, {}],
      host_staff: { data: [{ user_id: "staff-1" }, { user_id: "staff-2" }] },
    });

    expect((await del()).status).toBe(200);

    expect(sc.builderFor("host_staff").eq).toHaveBeenCalledWith("host_id", "host-1");
    expect(sc.auth.admin.deleteUser).toHaveBeenNthCalledWith(1, "staff-1");
    expect(sc.auth.admin.deleteUser).toHaveBeenNthCalledWith(2, "staff-2");
    expect(sc.auth.admin.deleteUser).toHaveBeenLastCalledWith("owner-1");
    const staffDelete = sc.auth.admin.deleteUser.mock.invocationCallOrder[0];
    const hostDelete = (sc.builderFor("hosts", 1).delete as ReturnType<typeof vi.fn>).mock.invocationCallOrder[0];
    expect(staffDelete).toBeLessThan(hostDelete);
  });

  // A staff login has no hosts row: it can close its own login and nothing else.
  it("deletes only a staff login's own user, never the host's data or other logins", async () => {
    const sc = mockClients({ hosts: { data: null } }, "staff-1");

    expect((await del()).status).toBe(200);

    expect(sc.calls.some((c) => c.table === "host_staff")).toBe(false);
    expect(sc.calls.some((c) => c.table === "homestays")).toBe(false);
    expect(sc.auth.admin.deleteUser).toHaveBeenCalledTimes(1);
    expect(sc.auth.admin.deleteUser).toHaveBeenCalledWith("staff-1");
  });

  it("refuses without the PIN when the owner has one", async () => {
    const sc = mockClients({ hosts: { data: { id: "host-1", security_pin_hash: "$2a$10$hash" } } });

    expect((await del()).status).toBe(403);
    expect(sc.auth.admin.deleteUser).not.toHaveBeenCalled();
  });

  // 2026-11-20 (owner's rule): deleting used to wipe future bookings and tell no guest.
  // The host cancels them first (each guest is emailed), then deletes.
  it("refuses while the homestay has bookings still to come, and deletes nothing", async () => {
    const sc = mockClients({
      hosts: { data: { id: "host-1", security_pin_hash: null } },
      homestays: { data: { id: "hs-1" } },
      bookings: { count: 2 },
    });

    const { status, body } = await del();
    expect(status).toBe(409);
    expect(body).toEqual({ error: "UPCOMING_BOOKINGS", count: 2 });
    expect(sc.builderFor("bookings").in).toHaveBeenCalledWith("status", ["pending", "verified", "confirmed"]);
    expect(sc.builderFor("bookings").delete).not.toHaveBeenCalled();
    expect(sc.calls.some((c) => c.table === "rooms")).toBe(false);
    expect(sc.auth.admin.deleteUser).not.toHaveBeenCalled();
  });

  it("deletes once every booking has ended or been cancelled", async () => {
    const sc = mockClients({
      hosts: [{ data: { id: "host-1", security_pin_hash: null } }, {}],
      homestays: [{ data: { id: "hs-1" } }, {}],
      bookings: [{ count: 0 }, {}],
      rooms: { data: [] },
      blocked_dates: {},
      host_staff: { data: [] },
    });

    expect((await del()).status).toBe(200);
    expect(sc.auth.admin.deleteUser).toHaveBeenCalledWith("owner-1");
  });

  it("deletes nothing when the bookings cannot be counted", async () => {
    const sc = mockClients({
      hosts: { data: { id: "host-1", security_pin_hash: null } },
      homestays: { data: { id: "hs-1" } },
      bookings: { error: { message: "db down" } },
    });

    expect((await del()).status).toBe(500);
    expect(sc.auth.admin.deleteUser).not.toHaveBeenCalled();
  });

  it("turns away a signed-out caller", async () => {
    h.createServerSupabaseClient.mockResolvedValue(createSupabaseMock({ user: null }));
    expect((await del()).status).toBe(401);
  });
});
