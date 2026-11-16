import { beforeEach, describe, expect, it, vi } from "vitest";
import { middleware } from "./middleware";
import { createSupabaseMock, type QueryResponse } from "../test/helpers/supabase";
import { makeRequest } from "../test/helpers/request";

const h = vi.hoisted(() => ({ getUser: vi.fn(), createClient: vi.fn() }));

vi.mock("@supabase/ssr", () => ({ createServerClient: () => ({ auth: { getUser: h.getUser } }) }));
vi.mock("@supabase/supabase-js", () => ({ createClient: h.createClient }));

function signedIn(userId: string, tables: Record<string, QueryResponse> = {}) {
  h.getUser.mockResolvedValue({ data: { user: { id: userId } }, error: null });
  const sc = createSupabaseMock({ tables });
  h.createClient.mockReturnValue(sc);
  return sc;
}

const visit = (path: string, cookie?: string) =>
  middleware(makeRequest(path, { method: "GET", headers: cookie ? { cookie } : {} }));

const STAFF = { hosts: { data: null }, host_staff: { data: { id: "staff-row" } } };
const OWNER = { hosts: { data: { status: "approved" } } };

beforeEach(() => {
  h.createClient.mockReset();
});

// Staff logins (migration 081): billing, wallet and the owner's profile are the owner's.
describe("middleware: staff logins", () => {
  it.each(["/dashboard/billing", "/dashboard/wallet", "/dashboard/profile", "/dashboard/pending"])(
    "sends staff from %s to the dashboard",
    async (path) => {
      signedIn("staff-1", STAFF);
      const res = await visit(path);
      expect(res.status).toBe(307);
      expect(new URL(res.headers.get("location")!).pathname).toBe("/dashboard");
      expect(res.cookies.get("x-host-status")?.value).toBe("staff-1:staff");
    },
  );

  it.each(["/dashboard", "/dashboard/bookings", "/dashboard/rooms", "/dashboard/billingish"])(
    "lets staff open %s",
    async (path) => {
      signedIn("staff-1", STAFF);
      const res = await visit(path);
      expect(res.headers.get("location")).toBeNull();
    },
  );

  it("lets the owner open billing", async () => {
    signedIn("owner-1", OWNER);
    const res = await visit("/dashboard/billing");
    expect(res.headers.get("location")).toBeNull();
    expect(res.cookies.get("x-host-status")?.value).toBe("owner-1:approved");
  });
});

describe("middleware: the cached host status", () => {
  it("trusts a cached status only for the login it was cached for", async () => {
    // The owner signed in after a staff member on the same browser.
    const sc = signedIn("owner-1", OWNER);
    const res = await visit("/dashboard/billing", "x-host-status=staff-1:staff");
    expect(res.headers.get("location")).toBeNull();
    expect(sc.from).toHaveBeenCalledWith("hosts");
  });

  it("re-reads an old-format cookie", async () => {
    const sc = signedIn("staff-1", STAFF);
    const res = await visit("/dashboard/billing", "x-host-status=approved");
    expect(new URL(res.headers.get("location")!).pathname).toBe("/dashboard");
    expect(sc.from).toHaveBeenCalledWith("host_staff");
  });

  it("uses this login's own cached status without a query", async () => {
    signedIn("staff-1", STAFF);
    const res = await visit("/dashboard/wallet", "x-host-status=staff-1:staff");
    expect(new URL(res.headers.get("location")!).pathname).toBe("/dashboard");
    expect(h.createClient).not.toHaveBeenCalled();
  });

  it("still sends a pending host to the pending page", async () => {
    signedIn("owner-1", { hosts: { data: { status: "pending" } } });
    const res = await visit("/dashboard/bookings");
    expect(new URL(res.headers.get("location")!).pathname).toBe("/dashboard/pending");
    expect(res.cookies.get("x-host-status")?.value).toBe("owner-1:pending");
  });
});
