import { beforeEach, describe, expect, it, vi } from "vitest";
import { GET } from "./route";
import { signIn, signOut, sessionError } from "../../../../../test/helpers/auth";
import { readJson } from "../../../../../test/helpers/request";

const h = vi.hoisted(() => ({
  createServerSupabaseClient: vi.fn(),
  createServiceRoleClient: vi.fn(),
  isAdmin: vi.fn(),
}));
vi.mock("@/lib/supabase/server", () => ({
  createServerSupabaseClient: h.createServerSupabaseClient,
  createServiceRoleClient: h.createServiceRoleClient,
}));
vi.mock("@/lib/admin", () => ({ isAdmin: h.isAdmin }));

const root = {
  id: "a1",
  user_id: "u1",
  name: "Root",
  email: "root@example.com",
  created_at: "2026-01-01T00:00:00Z",
  line_user_id: "U123",
  line_channel_access_token: "secret-token",
};
const ops = { ...root, id: "a2", user_id: "u2", name: "Ops", email: "ops@example.com", line_channel_access_token: null };

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("GET /api/admin/admins", () => {
  it("lists admins with their latest login and never the LINE token", async () => {
    const sc = signIn(h, {
      tables: {
        platform_admins: { data: [root, ops] },
        history_logs: {
          data: [
            { entity_id: "u1", created_at: "2026-11-18T02:40:00Z" },
            { entity_id: "u1", created_at: "2026-11-17T02:40:00Z" },
          ],
        },
      },
    });

    const { status, body } = await readJson(await GET());
    expect(status).toBe(200);
    expect(body).toEqual({
      data: [
        { id: "a1", name: "Root", email: "root@example.com", created_at: root.created_at, line_alerts: true, last_login_at: "2026-11-18T02:40:00Z" },
        { id: "a2", name: "Ops", email: "ops@example.com", created_at: root.created_at, line_alerts: false, last_login_at: null },
      ],
    });
    expect(JSON.stringify(body)).not.toContain("secret-token");
    expect(sc.builderFor("history_logs").eq).toHaveBeenCalledWith("event_type", "ADMIN_LOGIN");
    expect(sc.builderFor("history_logs").in).toHaveBeenCalledWith("entity_id", ["u1", "u2"]);
  });

  it("refuses a signed-in non-admin", async () => {
    signIn(h, { admin: false });
    expect((await GET()).status).toBe(401);
  });

  it("refuses an anonymous caller", async () => {
    signOut(h);
    expect((await GET()).status).toBe(401);
  });

  it("refuses a caller whose session errored", async () => {
    sessionError(h);
    expect((await GET()).status).toBe(401);
  });

  it("reports a generic 500 when the read fails", async () => {
    signIn(h, { tables: { platform_admins: { error: { message: "relation does not exist" } } } });
    await expect(readJson(await GET())).resolves.toEqual({ status: 500, body: { error: "Failed to fetch admins" } });
  });
});
