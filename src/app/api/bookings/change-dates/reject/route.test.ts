import { beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "./route";
import { signIn, signOut } from "../../../../../../test/helpers/auth";
import { makeRequest, readJson } from "../../../../../../test/helpers/request";

const h = vi.hoisted(() => ({
  createServerSupabaseClient: vi.fn(),
  createServiceRoleClient: vi.fn(),
  logEvent: vi.fn(),
  sendDateChangeEmailToGuest: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createServerSupabaseClient: h.createServerSupabaseClient,
  createServiceRoleClient: h.createServiceRoleClient,
}));
vi.mock("@/lib/notifications", () => ({ sendDateChangeEmailToGuest: h.sendDateChangeEmailToGuest }));
vi.mock("@/lib/history-log", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/history-log")>()),
  logEvent: h.logEvent,
}));
vi.mock("next/server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/server")>()),
  after: () => {},
}));

const REQUEST = {
  id: "dcr-1",
  booking_id: "bk-1",
  old_check_in: "2026-12-01",
  old_check_out: "2026-12-03",
  new_check_in: "2026-12-05",
  new_check_out: "2026-12-07",
  new_total_price: 3000,
  price_difference: 0,
};

function mockClient(hostUserId: string, staffRow: unknown = null) {
  return signIn(h, {
    tables: {
      date_change_requests: [{ data: REQUEST }, {}],
      bookings: { data: { id: "bk-1", homestay_id: "hs-1", room_id: null } },
      homestays: { data: { id: "hs-1", hosts: { id: "host-1", user_id: hostUserId, name: "Peaks" } } },
      host_staff: { data: staffRow },
    },
  });
}

const reject = async () =>
  readJson(await POST(makeRequest("/api/bookings/change-dates/reject", { body: { request_id: "dcr-1" } })));

/** Whether the request row was written to. */
const rejected = (supabase: ReturnType<typeof mockClient>) =>
  supabase.calls
    .filter((c) => c.table === "date_change_requests")
    .some((c) => (c.builder.update as ReturnType<typeof vi.fn>).mock.calls.length > 0);

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("POST /api/bookings/change-dates/reject", () => {
  it("lets the owner reject a date change", async () => {
    const supabase = mockClient("user-1");
    expect((await reject()).status).toBe(200);
    expect(rejected(supabase)).toBe(true);
  });

  // Staff logins (migration 081): user-1 is not the owner here, only a staff row can let it in.
  it("lets staff of the host reject a date change", async () => {
    const supabase = mockClient("owner-9", { id: "staff-row" });
    expect((await reject()).status).toBe(200);
    expect(supabase.builderFor("host_staff").eq).toHaveBeenCalledWith("host_id", "host-1");
    expect(rejected(supabase)).toBe(true);
  });

  it("refuses a login that is neither owner nor staff of this host", async () => {
    const supabase = mockClient("owner-9");
    expect((await reject()).status).toBe(403);
    expect(rejected(supabase)).toBe(false);
  });

  it("turns away a signed-out caller", async () => {
    signOut(h);
    expect((await reject()).status).toBe(401);
  });
});
