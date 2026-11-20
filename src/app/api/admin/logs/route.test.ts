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

const HOST_ID = "6f1c2a7e-3b4d-4e5f-8a9b-0c1d2e3f4a5b";
const host = { id: HOST_ID, user_id: "user-1", email: "wang@example.com", name: "Wang" };

// System events about invoices: no label lookups beyond the homestay names.
const log = (id: string, created_at: string, homestay_id: string | null = null) => ({
  id,
  homestay_id,
  entity_type: "invoice",
  entity_id: "inv-1",
  event_type: "INVOICE_PAID",
  actor_type: "system",
  actor_id: null,
  data: {},
  ip_address: null,
  created_at,
});
const A = log("a", "2026-11-20T10:00:00Z");
const B = log("b", "2026-11-20T08:00:00Z");
const C = log("c", "2026-11-20T09:00:00Z", "hs-1");

const get = (searchParams?: Record<string, string>) =>
  GET(makeRequest("/api/admin/logs", { method: "GET", searchParams }));
const ids = (body: unknown) => (body as { data: { id: string }[] }).data.map((l) => l.id);

/** A host with one homestay and one invoice; entity-keyed logs first, homestay-keyed second. */
const withHostLogs = (byEntity: unknown[], byHomestay: unknown[], extra: Record<string, unknown> = {}) =>
  signIn(mocks, {
    tables: {
      hosts: { data: host },
      homestays: [{ data: [{ id: "hs-1" }] }, { data: [{ id: "hs-1", name: "Cozy" }] }],
      invoices: { data: [{ id: "inv-1" }] },
      history_logs: [{ data: byEntity }, { data: byHomestay }],
      ...extra,
    },
  });

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("GET /api/admin/logs", () => {
  it("refuses an anonymous caller", async () => {
    signOut(mocks);
    expect((await get()).status).toBe(401);
  });

  it("lists every host's logs with one read when no host is given, and names no host", async () => {
    const sc = signIn(mocks, { tables: { history_logs: { data: [A, B] }, homestays: { data: [] } } });
    const { status, body } = await readJson(await get());
    expect(status).toBe(200);
    expect(ids(body)).toEqual(["a", "b"]);
    expect(body).not.toHaveProperty("host");
    expect(sc.calls.filter((c) => c.table === "history_logs")).toHaveLength(1);
  });

  it("names a subject it has no lookup for in words, not its stored code", async () => {
    signIn(mocks, { tables: { history_logs: { data: [{ ...A, entity_type: "platform" }, { ...B, entity_type: "billing" }] } } });
    const { body } = await readJson(await get());
    expect((body as { data: { entity_label: string }[] }).data.map((l) => l.entity_label)).toEqual(["Platform", "Billing"]);
  });

  describe("host_id", () => {
    it("refuses an id that is not a UUID, before reading anything", async () => {
      const sc = withHostLogs([], []);
      const { status, body } = await readJson(await get({ host_id: "wang" }));
      expect(status).toBe(400);
      expect(body).toEqual({ error: "Invalid host_id" });
      expect(sc.calls).toHaveLength(0);
    });

    // Same scope as the host page's Activity: host id, auth user id, login email, invoice ids; or its homestays.
    it("reads the host's logs by key and by homestay, merged newest first without repeats", async () => {
      const sc = withHostLogs([A, B], [C, A]);
      const { status, body } = await readJson(await get({ host_id: HOST_ID }));

      expect(status).toBe(200);
      expect(ids(body)).toEqual(["a", "c", "b"]);
      expect(body).toMatchObject({ host: { id: HOST_ID, name: "Wang" }, hasMore: false, nextCursor: null });
      expect(sc.builderFor("history_logs", 0).in).toHaveBeenCalledWith("entity_id", [HOST_ID, "user-1", "wang@example.com", "inv-1"]);
      expect(sc.builderFor("history_logs", 1).in).toHaveBeenCalledWith("homestay_id", ["hs-1"]);
    });

    it("pages the merged list with the same cursor as the unfiltered one", async () => {
      const sc = withHostLogs([A, B], [C]);
      const { body } = await readJson(await get({ host_id: HOST_ID, limit: "2" }));

      expect(ids(body)).toEqual(["a", "c"]);
      expect(body).toMatchObject({ hasMore: true, nextCursor: "2026-11-20T09:00:00Z" });
      expect(sc.builderFor("history_logs", 0).limit).toHaveBeenCalledWith(3);
      expect(sc.builderFor("history_logs", 1).limit).toHaveBeenCalledWith(3);
    });

    it("applies the cursor and the other filters to both reads", async () => {
      const sc = withHostLogs([], []);
      await get({ host_id: HOST_ID, before: "2026-11-19T00:00:00Z", event_type: "INVOICE_PAID", actor_type: "system" });
      for (const i of [0, 1]) {
        const q = sc.builderFor("history_logs", i);
        expect(q.lt).toHaveBeenCalledWith("created_at", "2026-11-19T00:00:00Z");
        expect(q.eq).toHaveBeenCalledWith("event_type", "INVOICE_PAID");
        expect(q.eq).toHaveBeenCalledWith("actor_type", "system");
      }
    });

    it("answers an unknown host with an empty list, not an error", async () => {
      const sc = withHostLogs([A], [], { hosts: { data: null } });
      const { status, body } = await readJson(await get({ host_id: HOST_ID }));
      expect(status).toBe(200);
      expect(body).toEqual({ data: [], hasMore: false, nextCursor: null, host: null });
      expect(sc.calls.map((c) => c.table)).not.toContain("history_logs");
    });

    it("reports 500 with a generic message when a read fails", async () => {
      signIn(mocks, {
        tables: {
          hosts: { data: host },
          homestays: { data: [{ id: "hs-1" }] },
          invoices: { data: [] },
          history_logs: [{ data: [A] }, { error: { message: "boom" } }],
        },
      });
      const { status, body } = await readJson(await get({ host_id: HOST_ID }));
      expect(status).toBe(500);
      expect(body).toEqual({ error: "Failed to fetch logs" });
    });
  });
});
