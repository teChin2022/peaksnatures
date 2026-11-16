import { describe, expect, it, vi } from "vitest";
import { canActForHost, deleteStaffLogins, getHostAccess } from "./host-access";
import { createSupabaseMock } from "../../test/helpers/supabase";

type Client = Parameters<typeof getHostAccess>[0];
const client = (mock: ReturnType<typeof createSupabaseMock>) => mock as unknown as Client;

describe("getHostAccess", () => {
  it("returns the owned host first", async () => {
    const sc = createSupabaseMock({ tables: { hosts: { data: { id: "host-1" } } } });
    expect(await getHostAccess(client(sc), "user-1")).toEqual({ hostId: "host-1", role: "owner" });
    expect(sc.builderFor("hosts").eq).toHaveBeenCalledWith("user_id", "user-1");
    expect(sc.calls.some((c) => c.table === "host_staff")).toBe(false);
  });

  it("falls back to the host the user is staff of", async () => {
    const sc = createSupabaseMock({
      tables: { hosts: { data: null }, host_staff: { data: { host_id: "host-1" } } },
    });
    expect(await getHostAccess(client(sc), "staff-1")).toEqual({ hostId: "host-1", role: "staff" });
    expect(sc.builderFor("host_staff").eq).toHaveBeenCalledWith("user_id", "staff-1");
  });

  it("returns null for a user who is neither", async () => {
    const sc = createSupabaseMock({ tables: { hosts: { data: null }, host_staff: { data: null } } });
    expect(await getHostAccess(client(sc), "stranger")).toBeNull();
  });
});

describe("canActForHost", () => {
  const host = { id: "host-1", user_id: "owner-1" };

  it("lets the owner through without a staff lookup", async () => {
    const sc = createSupabaseMock();
    expect(await canActForHost(client(sc), "owner-1", host)).toBe(true);
    expect(sc.from).not.toHaveBeenCalled();
  });

  it("lets staff of this host through", async () => {
    const sc = createSupabaseMock({ tables: { host_staff: { data: { id: "row-1" } } } });
    expect(await canActForHost(client(sc), "staff-1", host)).toBe(true);
    const q = sc.builderFor("host_staff");
    expect(q.eq).toHaveBeenCalledWith("host_id", "host-1");
    expect(q.eq).toHaveBeenCalledWith("user_id", "staff-1");
  });

  it("refuses staff of another host", async () => {
    const sc = createSupabaseMock({ tables: { host_staff: { data: null } } });
    expect(await canActForHost(client(sc), "staff-of-host-2", host)).toBe(false);
  });
});

describe("deleteStaffLogins", () => {
  it("deletes each staff auth user of the host", async () => {
    const sc = createSupabaseMock({
      tables: { host_staff: { data: [{ user_id: "staff-1" }, { user_id: "staff-2" }] } },
    });
    await deleteStaffLogins(client(sc), "host-1");
    expect(sc.builderFor("host_staff").eq).toHaveBeenCalledWith("host_id", "host-1");
    expect(sc.auth.admin.deleteUser).toHaveBeenCalledWith("staff-1");
    expect(sc.auth.admin.deleteUser).toHaveBeenCalledWith("staff-2");
  });

  it("keeps going when one delete fails", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const sc = createSupabaseMock({
      tables: { host_staff: { data: [{ user_id: "staff-1" }, { user_id: "staff-2" }] } },
      deleteUserError: { message: "boom" },
    });
    await deleteStaffLogins(client(sc), "host-1");
    expect(sc.auth.admin.deleteUser).toHaveBeenCalledTimes(2);
    error.mockRestore();
  });
});
