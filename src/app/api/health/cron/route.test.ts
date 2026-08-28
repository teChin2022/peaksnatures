import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GET } from "./route";
import { createSupabaseMock } from "../../../../../test/helpers/supabase";
import { readJson } from "../../../../../test/helpers/request";

const { createServerSupabaseClient, createServiceRoleClient, isAdmin } = vi.hoisted(() => ({
  createServerSupabaseClient: vi.fn(),
  createServiceRoleClient: vi.fn(),
  isAdmin: vi.fn(),
}));
vi.mock("@/lib/supabase/server", () => ({ createServerSupabaseClient, createServiceRoleClient }));
vi.mock("@/lib/admin", () => ({ isAdmin }));

const NOW = new Date("2026-06-15T12:00:00Z");
const hoursAgo = (h: number) => new Date(NOW.getTime() - h * 60 * 60 * 1000).toISOString();

const signedInAsAdmin = () => {
  createServerSupabaseClient.mockResolvedValue(createSupabaseMock({ user: { id: "user-1" } }));
  isAdmin.mockResolvedValue(true);
};

const lastRun = (row: unknown) => {
  createServiceRoleClient.mockReturnValue(createSupabaseMock({ tables: { history_logs: { data: row } } }));
};

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  signedInAsAdmin();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("GET /api/health/cron", () => {
  it("is ok after a recent successful run", async () => {
    lastRun({ event_type: "cron_billing_success", created_at: hoursAgo(2) });

    await expect(readJson(await GET())).resolves.toEqual({
      status: 200,
      body: { status: "ok", last_run: hoursAgo(2), last_status: "success" },
    });
  });

  it("is ok right up to the 25 hour threshold", async () => {
    lastRun({ event_type: "cron_billing_success", created_at: hoursAgo(24) });
    expect((await GET()).status).toBe(200);
  });

  it("is stale once the last success is older than 25 hours", async () => {
    lastRun({ event_type: "cron_billing_success", created_at: hoursAgo(26) });

    const { status, body } = await readJson(await GET());
    expect(status).toBe(503);
    expect(body).toMatchObject({ status: "stale", last_status: "success" });
  });

  it("is stale when the most recent run failed, however recent", async () => {
    lastRun({ event_type: "cron_billing_failure", created_at: hoursAgo(1) });

    const { status, body } = await readJson(await GET());
    expect(status).toBe(503);
    expect(body).toMatchObject({ status: "stale", last_status: "failure" });
  });

  it("is stale when the cron has never run", async () => {
    lastRun(null);

    await expect(readJson(await GET())).resolves.toEqual({
      status: 503,
      body: { status: "stale", last_run: null, last_status: null },
    });
  });

  it("reads only the newest billing-cron log line", async () => {
    const supabase = createSupabaseMock({ tables: { history_logs: { data: null } } });
    createServiceRoleClient.mockReturnValue(supabase);

    await GET();

    const builder = supabase.builderFor("history_logs");
    expect(builder.eq).toHaveBeenCalledWith("entity_id", "cron_billing");
    expect(builder.in).toHaveBeenCalledWith("event_type", ["cron_billing_success", "cron_billing_failure"]);
    expect(builder.order).toHaveBeenCalledWith("created_at", { ascending: false });
    expect(builder.limit).toHaveBeenCalledWith(1);
  });

  describe("access", () => {
    it("refuses an anonymous caller", async () => {
      createServerSupabaseClient.mockResolvedValue(createSupabaseMock({ user: null }));
      await expect(readJson(await GET())).resolves.toEqual({ status: 401, body: { error: "Unauthorized" } });
    });

    it("refuses a caller whose session errored", async () => {
      createServerSupabaseClient.mockResolvedValue(
        createSupabaseMock({ user: null, authError: { message: "expired" } }),
      );
      expect((await GET()).status).toBe(401);
    });

    it("refuses a signed-in non-admin", async () => {
      isAdmin.mockResolvedValue(false);
      expect((await GET()).status).toBe(401);
    });
  });
});
