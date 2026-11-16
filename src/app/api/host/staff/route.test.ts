import { beforeEach, describe, expect, it, vi } from "vitest";
import { GET, POST } from "./route";
import { DELETE, PATCH } from "./[id]/route";
import { createSupabaseMock, type QueryResponse } from "../../../../../test/helpers/supabase";
import { makeRequest, readJson } from "../../../../../test/helpers/request";

const h = vi.hoisted(() => ({
  createServerSupabaseClient: vi.fn(),
  createServiceRoleClient: vi.fn(),
  signInWithPassword: vi.fn(),
  signOut: vi.fn(),
  logEvent: vi.fn(),
  sendStaffAccountEmail: vi.fn(),
  afterCallbacks: [] as Array<() => unknown>,
}));

vi.mock("@/lib/supabase/server", () => ({
  createServerSupabaseClient: h.createServerSupabaseClient,
  createServiceRoleClient: h.createServiceRoleClient,
}));
// The throwaway client that re-checks the owner's password.
vi.mock("@supabase/supabase-js", () => ({
  createClient: () => ({ auth: { signInWithPassword: h.signInWithPassword, signOut: h.signOut } }),
}));
vi.mock("@/lib/history-log", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/history-log")>()),
  logEvent: h.logEvent,
}));
vi.mock("@/lib/notifications", () => ({ sendStaffAccountEmail: h.sendStaffAccountEmail }));
vi.mock("next/server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/server")>()),
  after: (cb: () => unknown) => {
    h.afterCallbacks.push(cb);
  },
}));

const STAFF_ID = "5f0b6f0e-1111-4111-8111-111111111111";
const NEW_USER = "new-staff-user";
const goodBody = { name: "Noi", email: " Noi@Example.com ", password: "Staff_2026", ownerPassword: "Owner#2026" };

// The owner-password limiter is per owner and in memory, so each test signs in a fresh owner.
let n = 0;
let ownerId = "";

function mockOwner(
  tables: Record<string, QueryResponse | QueryResponse[]> = {},
  { isOwner = true, createError = null as unknown, signedIn = true } = {},
) {
  ownerId = `owner-${++n}`;
  h.createServerSupabaseClient.mockResolvedValue(
    createSupabaseMock({ user: signedIn ? ({ id: ownerId, email: "owner@example.com" } as { id: string }) : null }),
  );
  const sc = createSupabaseMock({
    tables: { hosts: { data: isOwner ? { id: "host-1", name: "Somchai" } : null }, ...tables },
  });
  const admin = sc.auth.admin as Record<string, unknown>;
  admin.createUser = vi.fn(() =>
    Promise.resolve(createError ? { data: { user: null }, error: createError } : { data: { user: { id: NEW_USER } }, error: null }),
  );
  admin.updateUserById = vi.fn(() => Promise.resolve({ data: {}, error: null }));
  h.createServiceRoleClient.mockReturnValue(sc);
  return sc as typeof sc & {
    auth: { admin: { createUser: ReturnType<typeof vi.fn>; updateUserById: ReturnType<typeof vi.fn> } };
  };
}

const runAfter = async () => {
  for (const cb of h.afterCallbacks.splice(0)) await cb();
};
const create = async (body: unknown = goodBody) =>
  readJson(await POST(makeRequest("/api/host/staff", { body })));
const list = async () => readJson(await GET());
const ctx = (id = STAFF_ID) => ({ params: Promise.resolve({ id }) });
const reset = async (body: unknown = { password: "Fresh_2026", ownerPassword: "Owner#2026" }, id?: string) =>
  readJson(await PATCH(makeRequest(`/api/host/staff/${id ?? STAFF_ID}`, { method: "PATCH", body }), ctx(id)));
const remove = async (body: unknown = { ownerPassword: "Owner#2026" }, id?: string) =>
  readJson(await DELETE(makeRequest(`/api/host/staff/${id ?? STAFF_ID}`, { method: "DELETE", body }), ctx(id)));

const staffRow = (over: Record<string, unknown> = {}) => ({
  data: { id: STAFF_ID, user_id: "staff-user-1", name: "Noi", email: "noi@example.com", ...over },
});

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  h.afterCallbacks.length = 0;
  h.signInWithPassword.mockReset().mockResolvedValue({ error: null });
  h.signOut.mockReset().mockResolvedValue({ error: null });
  h.logEvent.mockReset().mockResolvedValue(undefined);
  h.sendStaffAccountEmail.mockReset().mockResolvedValue({ success: true });
});

describe("GET /api/host/staff", () => {
  it("lists the staff of the owner's own host", async () => {
    const sc = mockOwner({ host_staff: { data: [{ id: STAFF_ID, name: "Noi" }] } });

    const { status, body } = await list();

    expect(status).toBe(200);
    expect(body).toEqual({ staff: [{ id: STAFF_ID, name: "Noi" }] });
    expect(sc.builderFor("hosts").eq).toHaveBeenCalledWith("user_id", ownerId);
    expect(sc.builderFor("host_staff").eq).toHaveBeenCalledWith("host_id", "host-1");
  });

  it("turns away a signed-out caller", async () => {
    mockOwner({}, { signedIn: false });
    expect((await list()).status).toBe(401);
  });

  // A staff login has no hosts row, so it cannot see or manage the team.
  it("refuses a login that owns no host", async () => {
    const sc = mockOwner({}, { isOwner: false });
    expect((await list()).status).toBe(404);
    expect(sc.calls.some((c) => c.table === "host_staff")).toBe(false);
  });
});

describe("POST /api/host/staff", () => {
  it("creates a confirmed login and links it to the owner's host", async () => {
    const sc = mockOwner({ host_staff: [{ count: 0 }, { data: { id: STAFF_ID, name: "Noi" } }] });

    const { status, body } = await create({ ...goodBody, host_id: "someone-elses-host" });

    expect(status).toBe(201);
    expect(body).toEqual({ staff: { id: STAFF_ID, name: "Noi" } });
    expect(h.signInWithPassword).toHaveBeenCalledWith({ email: "owner@example.com", password: "Owner#2026" });
    expect(h.signOut).toHaveBeenCalledWith({ scope: "local" });
    expect(sc.auth.admin.createUser).toHaveBeenCalledWith({
      email: "noi@example.com",
      password: "Staff_2026",
      email_confirm: true,
    });
    expect(sc.builderFor("host_staff", 1).insert).toHaveBeenCalledWith({
      host_id: "host-1",
      user_id: NEW_USER,
      name: "Noi",
      email: "noi@example.com",
    });

    await runAfter();
    expect(h.logEvent).toHaveBeenCalledWith(expect.objectContaining({ eventType: "STAFF_ADDED", actorId: ownerId }));
    expect(h.sendStaffAccountEmail).toHaveBeenCalledWith("owner@example.com", {
      ownerName: "Somchai",
      staffName: "Noi",
      staffEmail: "noi@example.com",
      action: "added",
    });
  });

  it("never logs either password", async () => {
    mockOwner({ host_staff: [{ count: 0 }, { data: { id: STAFF_ID } }] });
    await create();
    await runAfter();
    const logged = JSON.stringify(h.logEvent.mock.calls);
    expect(logged).not.toContain("Staff_2026");
    expect(logged).not.toContain("Owner#2026");
  });

  it.each([
    ["a bad email", { email: "not-an-email" }],
    ["a password without the required characters", { password: "password1" }],
    ["a short password", { password: "Ab_1" }],
    ["no owner password", { ownerPassword: "" }],
    ["an empty name", { name: "   " }],
  ])("refuses %s before checking anything", async (_, over) => {
    const sc = mockOwner();
    expect((await create({ ...goodBody, ...over })).status).toBe(400);
    expect(h.signInWithPassword).not.toHaveBeenCalled();
    expect(sc.auth.admin.createUser).not.toHaveBeenCalled();
  });

  it("refuses a wrong owner password and creates nothing", async () => {
    h.signInWithPassword.mockResolvedValue({ error: { message: "Invalid login credentials" } });
    const sc = mockOwner({ host_staff: { count: 0 } });

    const { status, body } = await create();

    expect(status).toBe(403);
    expect(body).toEqual({ error: "WRONG_PASSWORD" });
    expect(sc.auth.admin.createUser).not.toHaveBeenCalled();
  });

  it("stops guessing the owner password after 10 tries in 15 minutes", async () => {
    h.signInWithPassword.mockResolvedValue({ error: { message: "Invalid login credentials" } });
    mockOwner({ host_staff: { count: 0 } });

    for (let i = 0; i < 10; i++) expect((await create()).status).toBe(403);
    expect((await create()).status).toBe(429);
    expect(h.signInWithPassword).toHaveBeenCalledTimes(10);
  });

  it("refuses a staff login (no hosts row) before the password check", async () => {
    mockOwner({}, { isOwner: false });
    expect((await create()).status).toBe(404);
    expect(h.signInWithPassword).not.toHaveBeenCalled();
  });

  it("refuses an 11th login", async () => {
    const sc = mockOwner({ host_staff: { count: 10 } });
    await expect(create()).resolves.toEqual({ status: 409, body: { error: "STAFF_LIMIT" } });
    expect(sc.auth.admin.createUser).not.toHaveBeenCalled();
  });

  it("reports an email that already has a login", async () => {
    mockOwner({ host_staff: { count: 0 } }, { createError: { code: "email_exists", message: "already registered" } });
    await expect(create()).resolves.toEqual({ status: 409, body: { error: "EMAIL_IN_USE" } });
  });

  it("deletes the new login when its row cannot be written", async () => {
    const sc = mockOwner({ host_staff: [{ count: 0 }, { error: { message: "insert failed" } }] });

    expect((await create()).status).toBe(500);
    expect(sc.auth.admin.deleteUser).toHaveBeenCalledWith(NEW_USER);
    expect(h.afterCallbacks).toHaveLength(0);
  });
});

describe("PATCH /api/host/staff/[id]", () => {
  it("sets a new password on the staff login of the owner's host", async () => {
    const sc = mockOwner({ host_staff: staffRow() });

    expect((await reset()).status).toBe(200);
    const q = sc.builderFor("host_staff");
    expect(q.eq).toHaveBeenCalledWith("id", STAFF_ID);
    expect(q.eq).toHaveBeenCalledWith("host_id", "host-1");
    expect(sc.auth.admin.updateUserById).toHaveBeenCalledWith("staff-user-1", { password: "Fresh_2026" });

    await runAfter();
    expect(h.sendStaffAccountEmail).toHaveBeenCalledWith(
      "owner@example.com",
      expect.objectContaining({ action: "password_reset", staffEmail: "noi@example.com" }),
    );
  });

  it("does not find a staff login of another host", async () => {
    const sc = mockOwner({ host_staff: { data: null } });
    expect((await reset()).status).toBe(404);
    expect(sc.auth.admin.updateUserById).not.toHaveBeenCalled();
  });

  // A row pointing at the owner cannot exist by construction; refuse it anyway.
  it("never touches the owner's own login", async () => {
    mockOwner();
    const sc = createSupabaseMock({
      tables: { hosts: { data: { id: "host-1", name: "Somchai" } }, host_staff: staffRow({ user_id: ownerId }) },
    });
    const updateUserById = vi.fn();
    (sc.auth.admin as Record<string, unknown>).updateUserById = updateUserById;
    h.createServiceRoleClient.mockReturnValue(sc);

    expect((await reset()).status).toBe(404);
    expect(updateUserById).not.toHaveBeenCalled();
  });

  it.each([
    ["a weak password", { password: "weak", ownerPassword: "Owner#2026" }, STAFF_ID],
    ["an id that is not a uuid", { password: "Fresh_2026", ownerPassword: "Owner#2026" }, "../owner"],
  ])("refuses %s", async (_, body, id) => {
    const sc = mockOwner({ host_staff: staffRow() });
    expect((await reset(body, id)).status).toBe(400);
    expect(sc.auth.admin.updateUserById).not.toHaveBeenCalled();
  });

  it("refuses a wrong owner password", async () => {
    h.signInWithPassword.mockResolvedValue({ error: { message: "Invalid login credentials" } });
    const sc = mockOwner({ host_staff: staffRow() });
    expect((await reset()).status).toBe(403);
    expect(sc.auth.admin.updateUserById).not.toHaveBeenCalled();
  });
});

describe("DELETE /api/host/staff/[id]", () => {
  it("deletes the staff login of the owner's host", async () => {
    const sc = mockOwner({ host_staff: staffRow() });

    expect((await remove()).status).toBe(200);
    expect(sc.auth.admin.deleteUser).toHaveBeenCalledWith("staff-user-1");

    await runAfter();
    expect(h.logEvent).toHaveBeenCalledWith(expect.objectContaining({ eventType: "STAFF_REMOVED" }));
    expect(h.sendStaffAccountEmail).toHaveBeenCalledWith(
      "owner@example.com",
      expect.objectContaining({ action: "removed" }),
    );
  });

  it("does not find a staff login of another host", async () => {
    const sc = mockOwner({ host_staff: { data: null } });
    expect((await remove()).status).toBe(404);
    expect(sc.auth.admin.deleteUser).not.toHaveBeenCalled();
  });

  it("refuses a wrong owner password", async () => {
    h.signInWithPassword.mockResolvedValue({ error: { message: "Invalid login credentials" } });
    const sc = mockOwner({ host_staff: staffRow() });
    expect((await remove()).status).toBe(403);
    expect(sc.auth.admin.deleteUser).not.toHaveBeenCalled();
  });

  it("refuses a staff login (no hosts row)", async () => {
    const sc = mockOwner({ host_staff: staffRow() }, { isOwner: false });
    expect((await remove()).status).toBe(404);
    expect(sc.auth.admin.deleteUser).not.toHaveBeenCalled();
  });
});
