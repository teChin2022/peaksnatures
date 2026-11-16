import { beforeEach, describe, expect, it, vi } from "vitest";
import { DELETE, POST } from "./route";
import { createSupabaseMock, type QueryResponse } from "../../../../test/helpers/supabase";
import { makeRequest, readJson } from "../../../../test/helpers/request";

const h = vi.hoisted(() => ({
  createServerSupabaseClient: vi.fn(),
  createServiceRoleClient: vi.fn(),
  logEvent: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createServerSupabaseClient: h.createServerSupabaseClient,
  createServiceRoleClient: h.createServiceRoleClient,
}));
vi.mock("@/lib/history-log", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/history-log")>()),
  logEvent: h.logEvent,
}));
vi.mock("next/server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/server")>()),
  after: () => {},
}));

const HOMESTAY_ID = "homestay-1";
const ROOM_A = "room-a";
const ROOM_B = "room-b";

/** The signed-in session: the homestay, bookings and the blocked_dates write. */
function sessionClient(tables: Record<string, QueryResponse | QueryResponse[]> = {}, userId = "user-1") {
  const client = createSupabaseMock({
    user: { id: userId },
    tables: {
      homestays: { data: { id: HOMESTAY_ID, hosts: { id: "host-1", name: "Somchai" } } },
      bookings: { data: [] },
      blocked_dates: [{ data: null }, { data: [{ id: "bd-1" }] }],
      ...tables,
    },
  });
  h.createServerSupabaseClient.mockResolvedValue(client);
  return client;
}

/**
 * The service role: who the user works for (owner by default), the homestay's
 * houses and the guests' holds on them.
 */
function serviceClient(holds: unknown[] = [], access: Record<string, QueryResponse> = {}) {
  const client = createSupabaseMock({
    tables: {
      hosts: { data: { id: "host-1" } },
      host_staff: { data: null },
      rooms: { data: [{ id: ROOM_A }, { id: ROOM_B }] },
      booking_holds: { data: holds },
      ...access,
    },
  });
  h.createServiceRoleClient.mockReturnValue(client);
  return client;
}

const hold = (room_id: string, check_in = "2026-12-10", check_out = "2026-12-12") => ({ room_id, check_in, check_out });

const block = async (over: Record<string, unknown> = {}) =>
  readJson(
    await POST(
      makeRequest("/api/blocked-dates", { body: { homestay_id: HOMESTAY_ID, dates: ["2026-12-10"], ...over } }),
    ),
  );

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  h.logEvent.mockResolvedValue(undefined);
});

describe("POST /api/blocked-dates: a guest's hold on the dates", () => {
  // The bug: holds were read with the host's session, which RLS shows no hold
  // at all, so a host could block a night a guest was paying for that minute.
  it("refuses to block a night a guest is holding at this homestay", async () => {
    sessionClient();
    serviceClient([hold(ROOM_A)]);

    const { status, body } = await block();

    expect(status).toBe(409);
    expect(body).toEqual({ error: "DATES_HELD", dates: ["2026-12-10"] });
  });

  it("reads only the holds on this homestay's houses", async () => {
    sessionClient();
    const sc = serviceClient([]);

    await block();

    expect(sc.builderFor("rooms").eq).toHaveBeenCalledWith("homestay_id", HOMESTAY_ID);
    expect(sc.builderFor("booking_holds").in).toHaveBeenCalledWith("room_id", [ROOM_A, ROOM_B]);
  });

  it("checks only the named house when the host blocks one house", async () => {
    sessionClient();
    const sc = serviceClient([]);

    await block({ room_id: ROOM_B });

    expect(sc.builderFor("booking_holds").in).toHaveBeenCalledWith("room_id", [ROOM_B]);
  });

  // A house id from another homestay must not let a host probe that homestay's holds.
  it("ignores a house that is not at this homestay", async () => {
    sessionClient();
    const sc = serviceClient([]);

    const { status } = await block({ room_id: "someone-elses-room" });

    expect(status).toBe(201);
    expect(sc.calls.some((c) => c.table === "booking_holds")).toBe(false);
  });

  it("blocks a night nobody is holding", async () => {
    sessionClient();
    serviceClient([hold(ROOM_A, "2026-12-20", "2026-12-22")]);

    const { status } = await block();

    expect(status).toBe(201);
  });

  it("does not read holds before ownership is proven", async () => {
    sessionClient();
    const sc = serviceClient([hold(ROOM_A)], { hosts: { data: null } });

    const { status } = await block();

    expect(status).toBe(403);
    expect(sc.calls.some((c) => c.table === "booking_holds")).toBe(false);
  });
});

// Staff logins (migration 081) block and unblock dates for the host they work for.
describe("/api/blocked-dates: staff", () => {
  const STAFF = "staff-1";
  const staffOf = (hostId: string) => ({ hosts: { data: null }, host_staff: { data: { host_id: hostId } } });
  const unblock = async () =>
    readJson(
      await DELETE(
        makeRequest("/api/blocked-dates", { method: "DELETE", body: { homestay_id: HOMESTAY_ID, dates: ["2026-12-10"] } }),
      ),
    );

  it("lets staff of the host block dates", async () => {
    sessionClient({}, STAFF);
    const sc = serviceClient([], staffOf("host-1"));

    const { status } = await block();

    expect(status).toBe(201);
    expect(sc.builderFor("host_staff").eq).toHaveBeenCalledWith("user_id", STAFF);
  });

  it("refuses staff of another host", async () => {
    sessionClient({}, STAFF);
    serviceClient([], staffOf("host-2"));

    const { status } = await block();

    expect(status).toBe(403);
  });

  it("lets staff of the host unblock dates", async () => {
    const session = sessionClient({ blocked_dates: { data: null } }, STAFF);
    serviceClient([], staffOf("host-1"));

    const { status } = await unblock();

    expect(status).toBe(200);
    expect(session.builderFor("blocked_dates").delete).toHaveBeenCalled();
  });

  it("refuses staff of another host an unblock", async () => {
    const session = sessionClient({ blocked_dates: { data: null } }, STAFF);
    serviceClient([], staffOf("host-2"));

    const { status } = await unblock();

    expect(status).toBe(403);
    expect(session.calls.some((c) => c.table === "blocked_dates")).toBe(false);
  });
});
