import { beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "./route";
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

const OWN = "11111111-1111-4111-8111-111111111111";
const OTHER = "22222222-2222-4222-8222-222222222222";
const NO_SLIP = "33333333-3333-4333-8333-333333333333";

function mockClients(
  tables: Record<string, QueryResponse | QueryResponse[]> = {
    hosts: { data: { id: "host-1" } },
    homestays: { data: [{ id: "homestay-1" }] },
    bookings: {
      data: [
        { id: OWN, payment_slip_url: "pending/own/slip.jpg" },
        { id: NO_SLIP, payment_slip_url: null },
      ],
    },
  },
  user: { id: string } | null = { id: "user-1" },
) {
  h.createServerSupabaseClient.mockResolvedValue(createSupabaseMock({ user }));
  const sc = createSupabaseMock({ tables });
  h.createServiceRoleClient.mockReturnValue(sc);
  return sc;
}

const post = async (payload: unknown) =>
  readJson(await POST(makeRequest("/api/host/booking-slips", { body: payload })));

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("POST /api/host/booking-slips", () => {
  it("signs the slips of the host's own bookings, for an hour", async () => {
    const sc = mockClients();

    const { status, body } = await post({ booking_ids: [OWN, NO_SLIP] });

    expect(status).toBe(200);
    expect(body).toEqual({ urls: { [OWN]: "https://storage.test/signed-slip" } });
    expect(sc.storage.from).toHaveBeenCalledWith("payment-slips");
    expect(sc.storage.createSignedUrls).toHaveBeenCalledWith(["pending/own/slip.jpg"], 3600);
  });

  // F-09: the browser used to sign any path in the bucket itself, under a
  // policy that let every signed-in user read every tenant's slips.
  it("reads only bookings at the host's own homestays, whatever ids are asked for", async () => {
    const sc = mockClients();

    await post({ booking_ids: [OWN, OTHER] });

    const q = sc.builderFor("bookings");
    expect(q.in).toHaveBeenCalledWith("id", [OWN, OTHER]);
    expect(q.in).toHaveBeenCalledWith("homestay_id", ["homestay-1"]);
  });

  it("signs a slip stored as a legacy signed URL by its path", async () => {
    const sc = mockClients({
      hosts: { data: { id: "host-1" } },
      homestays: { data: [{ id: "homestay-1" }] },
      bookings: {
        data: [{ id: OWN, payment_slip_url: "https://x.supabase.co/storage/v1/object/sign/payment-slips/pending/old/slip.jpg?token=t" }],
      },
    });

    await post({ booking_ids: [OWN] });

    expect(sc.storage.createSignedUrls).toHaveBeenCalledWith(["pending/old/slip.jpg"], 3600);
  });

  it("answers an empty map, without reading bookings, for a host with no homestay", async () => {
    const sc = mockClients({ hosts: { data: { id: "host-1" } }, homestays: { data: [] } });

    const { status, body } = await post({ booking_ids: [OWN] });

    expect(status).toBe(200);
    expect(body).toEqual({ urls: {} });
    expect(sc.calls.some((c) => c.table === "bookings")).toBe(false);
  });

  it("refuses a visitor who is not signed in", async () => {
    const sc = mockClients(undefined, null);

    expect((await post({ booking_ids: [OWN] })).status).toBe(401);
    expect(sc.from).not.toHaveBeenCalled();
  });

  it("refuses a signed-in user who is not a host", async () => {
    mockClients({ hosts: { data: null } });
    expect((await post({ booking_ids: [OWN] })).status).toBe(403);
  });

  it.each([
    ["no ids", { booking_ids: [] }],
    ["an id that is not a uuid", { booking_ids: ["../other/slip.jpg"] }],
    ["more than a page of ids", { booking_ids: Array.from({ length: 101 }, () => OWN) }],
  ])("refuses %s", async (_, payload) => {
    mockClients();
    expect((await post(payload)).status).toBe(400);
  });
});

// Staff logins (migration 081) see the slips of the host they work for.
describe("POST /api/host/booking-slips: staff", () => {
  it("signs slips at the homestays of the host the staff member works for", async () => {
    const sc = mockClients(
      {
        hosts: { data: null },
        host_staff: { data: { host_id: "host-1" } },
        homestays: { data: [{ id: "homestay-1" }] },
        bookings: { data: [{ id: OWN, payment_slip_url: "pending/own/slip.jpg" }] },
      },
      { id: "staff-1" },
    );

    const { status, body } = await post({ booking_ids: [OWN] });

    expect(status).toBe(200);
    expect(body).toEqual({ urls: { [OWN]: "https://storage.test/signed-slip" } });
    expect(sc.builderFor("homestays").eq).toHaveBeenCalledWith("host_id", "host-1");
  });

  it("refuses a login that is neither owner nor staff", async () => {
    mockClients({ hosts: { data: null }, host_staff: { data: null } }, { id: "stranger" });
    expect((await post({ booking_ids: [OWN] })).status).toBe(403);
  });
});
