import { beforeEach, describe, expect, it, vi } from "vitest";
import { PATCH } from "./route";
import { signIn, signOut, sessionError } from "../../../../../../../test/helpers/auth";
import { makeRequest, readJson } from "../../../../../../../test/helpers/request";
import { makeBillingConfig } from "../../../../../../../test/fixtures/db";
import { EventType } from "@/lib/history-log";
import type { QueryResponse } from "../../../../../../../test/helpers/supabase";

const h = vi.hoisted(() => ({
  createServerSupabaseClient: vi.fn(),
  createServiceRoleClient: vi.fn(),
  isAdmin: vi.fn(),
  logEvent: vi.fn(),
  afterCallbacks: [] as Array<() => unknown>,
}));

vi.mock("@/lib/supabase/server", () => ({
  createServerSupabaseClient: h.createServerSupabaseClient,
  createServiceRoleClient: h.createServiceRoleClient,
}));
vi.mock("@/lib/admin", () => ({ isAdmin: h.isAdmin }));
vi.mock("@/lib/history-log", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/history-log")>()),
  logEvent: h.logEvent,
}));
vi.mock("next/server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/server")>()),
  after: (cb: () => unknown) => {
    h.afterCallbacks.push(cb);
  },
}));

// The real billing module, with only the config read stubbed — the term the
// route writes and the amount it invoices are exactly what production computes.
const getBillingConfig = vi.fn();
vi.mock("@/lib/billing", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/billing")>()),
  getBillingConfig: () => getBillingConfig(),
}));

// Tiers 1/6/12 at 0/10/20% — 9 is deliberately absent, to pin what an
// unconfigured term does.
const CONFIG = makeBillingConfig({ fixed_rate_amount: 1000 });

const HOST_ID = "host-1";
const params = Promise.resolve({ id: HOST_ID });

const patch = (body: Record<string, unknown>) =>
  PATCH(makeRequest(`/api/admin/hosts/${HOST_ID}/plan`, { method: "PATCH", body }), { params });

interface Scenario {
  /** The host row the fixed_rate branch reads back before deciding. */
  host?: Record<string, unknown>;
  hosts?: QueryResponse[];
  invoices?: QueryResponse[];
  /** What activate_fixed_rate_plan answers. */
  rpc?: QueryResponse;
}

const freeHost = {
  plan_type: "free",
  fixed_rate_override: null,
  fixed_rate_term_ends_at: null,
};

/**
 * `.from("hosts")` is called twice on the fixed_rate path — read, then update —
 * but only once (the update) for free/commission, which never reads the host.
 */
const scenario = ({ host = freeHost, hosts, invoices, rpc = {} }: Scenario = {}) =>
  signIn(h, {
    tables: {
      platform_admins: { data: { name: "Root" } },
      hosts: hosts ?? [{ data: host }, {}],
      invoices: invoices ?? [{}],
    },
    rpc: { activate_fixed_rate_plan: rpc },
  });

/** The arguments activate_fixed_rate_plan was called with, or null. */
const rpcArgs = (sc: ReturnType<typeof scenario>) => {
  const call = (sc.rpc as ReturnType<typeof vi.fn>).mock.calls[0];
  return call ? (call[1] as Record<string, unknown>) : null;
};

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  h.afterCallbacks.length = 0;
  h.logEvent.mockReset();
  getBillingConfig.mockResolvedValue(CONFIG);
  scenario();
  vi.useFakeTimers();
  // 20 Sep in Bangkok: 11 of 30 days left, so every quote below is prorated and
  // the assertions hold whatever TZ the suite runs under.
  vi.setSystemTime(new Date("2026-09-20T10:00:00Z"));
  return () => vi.useRealTimers();
});

describe("PATCH /api/admin/hosts/[id]/plan", () => {
  describe("assigning Fixed Rate", () => {
    it("honours a configured term and bills the stub plus the discounted months", async () => {
      const sc = scenario();

      await expect(readJson(await patch({ plan_type: "fixed_rate", term_months: 6 }))).resolves.toEqual({
        status: 200,
        body: {
          success: true,
          plan_type: "fixed_rate",
          term_months: 6,
          term_started: true,
          invoice_created: true,
          // 11/30 of ฿1000 = ฿367, plus 6 × ฿1000 less the 10% tier discount.
          amount: 367 + 5400,
        },
      });

      // The plan, the term and the paid invoice commit in one RPC. As two calls
      // — host update, then invoice insert — a failed insert left a term with
      // no invoice behind it.
      expect(sc.rpc).toHaveBeenCalledWith("activate_fixed_rate_plan", {
        p_host_id: HOST_ID,
        p_amount: 5767,
        p_period_start: "2026-09-20",
        p_period_end: "2027-03-31",
        p_term_months: 6,
        p_discount_pct: 10,
        p_created_by: "Root",
        // Born paid: blockingInvoiceFilter matches neither `overdue` nor
        // `pending` past due, so this row can never block.
        p_status: "paid",
      });
      expect(sc.calls.filter((c) => c.table === "invoices")).toHaveLength(0);
      expect(sc.builderFor("hosts", 0).update).not.toHaveBeenCalled();
    });

    it("falls back to a 1-month term when none is sent", async () => {
      const sc = scenario();

      const { body } = await readJson(await patch({ plan_type: "fixed_rate" }));
      expect(body).toMatchObject({ term_months: 1, term_started: true, amount: 367 });

      expect(rpcArgs(sc)).toMatchObject({
        p_term_months: 1,
        // A 1-month term buys only the rest of the current month.
        p_period_end: "2026-09-30",
      });
    });

    it("falls back to 1 month for a term that is not a configured tier", async () => {
      const sc = scenario();

      const { body } = await readJson(await patch({ plan_type: "fixed_rate", term_months: 9 }));
      expect(body).toMatchObject({ term_months: 1 });
      expect(rpcArgs(sc)).toMatchObject({ p_term_months: 1 });
    });

    it("records the chosen term in the audit log", async () => {
      scenario();
      await patch({ plan_type: "fixed_rate", term_months: 12 });
      for (const cb of h.afterCallbacks) await cb();

      expect(h.logEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          entityType: "billing",
          eventType: EventType.INVOICE_PAID,
          data: expect.objectContaining({ amount: 367 + 9600, settled_offline: true }),
        }),
      );
      expect(h.logEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          entityType: "host",
          data: expect.objectContaining({
            plan_type: "fixed_rate",
            term_months: 12,
            term_started: true,
            fixed_rate_term_started_at: "2026-09-20",
            fixed_rate_term_ends_at: "2027-09-30",
          }),
        }),
      );
    });

    it("leaves a mid-term host's term and billing alone", async () => {
      const sc = scenario({
        host: {
          plan_type: "fixed_rate",
          fixed_rate_override: null,
          fixed_rate_term_ends_at: "2027-03-31",
        },
      });

      await expect(readJson(await patch({ plan_type: "fixed_rate", term_months: 12 }))).resolves.toEqual({
        status: 200,
        body: {
          success: true,
          plan_type: "fixed_rate",
          term_months: 12,
          term_started: false,
          invoice_created: false,
          amount: null,
        },
      });

      const update = (sc.builderFor("hosts", 1).update as ReturnType<typeof vi.fn>).mock
        .calls[0][0] as Record<string, unknown>;
      expect(update).not.toHaveProperty("fixed_rate_term_months");
      expect(update).not.toHaveProperty("fixed_rate_term_ends_at");
      expect(sc.calls.filter((c) => c.table === "invoices")).toHaveLength(0);
      expect(sc.rpc).not.toHaveBeenCalled();
    });

    // Same price the host's own re-activation and the daily cron charge: the
    // whole month from the 1st, never a cheaper stub.
    it("bills a lapsed Fixed Rate host the whole month from the 1st", async () => {
      const sc = scenario({
        host: { plan_type: "fixed_rate", fixed_rate_override: null, fixed_rate_term_ends_at: "2026-08-31" },
      });

      const { body } = await readJson(await patch({ plan_type: "fixed_rate", term_months: 1 }));
      expect(body).toMatchObject({ term_started: true, invoice_created: true, amount: 1000 });
      expect(rpcArgs(sc)).toMatchObject({
        p_amount: 1000,
        p_period_start: "2026-09-01",
        p_period_end: "2026-09-30",
      });
    });

    it("never bills twice for days a mid-month term already covered", async () => {
      const sc = scenario({
        host: {
          plan_type: "fixed_rate",
          fixed_rate_override: null,
          // Ended yesterday on the Bangkok calendar.
          fixed_rate_term_ends_at: "2026-09-19",
        },
      });

      const { body } = await readJson(await patch({ plan_type: "fixed_rate", term_months: 6 }));
      expect(body).toMatchObject({ term_started: true, invoice_created: true });
      expect(rpcArgs(sc)).toMatchObject({ p_term_months: 6, p_period_start: "2026-09-20" });
    });

    it("records the paid term without checking for an existing open invoice", async () => {
      const sc = scenario();

      const { body } = await readJson(await patch({ plan_type: "fixed_rate", term_months: 6 }));
      expect(body).toMatchObject({ term_started: true, invoice_created: true, amount: 5767 });

      // No invoices read at all. The old guard looked first and skipped when
      // anything was open, handing over a term with no record that it had been
      // paid for; a paid row stacks nothing, so it writes unconditionally and
      // unrelated debts stay open on their own.
      expect(sc.calls.filter((c) => c.table === "invoices")).toHaveLength(0);
      expect(rpcArgs(sc)).toMatchObject({ p_amount: 5767, p_status: "paid" });
    });

    it("never writes a pending invoice, whatever the term", async () => {
      for (const term_months of [1, 6, 12]) {
        const sc = scenario();
        await patch({ plan_type: "fixed_rate", term_months });
        expect(rpcArgs(sc)).toMatchObject({ p_status: "paid" });
      }
    });

    it("prices the term off a per-host rate override", async () => {
      const sc = scenario({
        host: { plan_type: "free", fixed_rate_override: 2000, fixed_rate_term_ends_at: null },
      });

      await patch({ plan_type: "fixed_rate", term_months: 6 });
      expect(rpcArgs(sc)).toMatchObject({ p_amount: 733 + 10800 });
    });

    it("reports 500 when the billing config is missing", async () => {
      getBillingConfig.mockResolvedValue(null);
      await expect(readJson(await patch({ plan_type: "fixed_rate", term_months: 6 }))).resolves.toEqual({
        status: 500,
        body: { error: "Billing config not found" },
      });
    });
  });

  describe("leaving Fixed Rate", () => {
    it.each(["free", "commission"] as const)("clears the term fields for %s", async (plan_type) => {
      const sc = scenario();

      const { body } = await readJson(await patch({ plan_type }));
      expect(body).toMatchObject({ plan_type, term_months: null, term_started: false });

      // No host read on this path — the update is the only .from("hosts") call.
      expect(sc.builderFor("hosts", 0).update).toHaveBeenCalledWith(
        expect.objectContaining({
          plan_type,
          fixed_rate_term_months: null,
          fixed_rate_term_started_at: null,
          fixed_rate_term_ends_at: null,
          plan_pending_type: null,
          plan_pending_term_months: null,
        }),
      );
      expect(sc.calls.filter((c) => c.table === "invoices")).toHaveLength(0);
    });

    it("keeps the expiry date when setting the free plan", async () => {
      const sc = scenario();
      await patch({ plan_type: "free", plan_free_expires_at: "2026-12-31T00:00:00Z" });

      expect(sc.builderFor("hosts", 0).update).toHaveBeenCalledWith(
        expect.objectContaining({ plan_free_expires_at: "2026-12-31T00:00:00Z" }),
      );
    });
  });

  describe("guards", () => {
    it("rejects an unknown plan type", async () => {
      await expect(readJson(await patch({ plan_type: "enterprise" }))).resolves.toEqual({
        status: 400,
        body: { error: "Invalid plan_type" },
      });
    });

    it("refuses an anonymous caller", async () => {
      signOut(h);
      await expect(readJson(await patch({ plan_type: "free" }))).resolves.toEqual({
        status: 401,
        body: { error: "Unauthorized" },
      });
    });

    it("refuses a caller whose session errored", async () => {
      sessionError(h);
      expect((await patch({ plan_type: "free" })).status).toBe(401);
    });

    it("refuses a signed-in non-admin", async () => {
      signIn(h, { admin: false });
      expect((await patch({ plan_type: "free" })).status).toBe(401);
    });

    it("reports 500 when the host update fails", async () => {
      // commission never reads the host, so the update is the first hosts call.
      scenario({ hosts: [{ error: { message: "constraint" } }] });
      await expect(readJson(await patch({ plan_type: "commission" }))).resolves.toEqual({
        status: 500,
        body: { error: "Failed to update plan" },
      });
    });

    it("reports 500 when the activation RPC fails, having written nothing", async () => {
      const sc = scenario({ rpc: { error: { message: "constraint" } } });
      await expect(readJson(await patch({ plan_type: "fixed_rate", term_months: 6 }))).resolves.toEqual({
        status: 500,
        body: { error: "Failed to update plan" },
      });
      expect(sc.builderFor("hosts", 0).update).not.toHaveBeenCalled();
      expect(h.afterCallbacks).toHaveLength(0);
    });

    // Another writer started a term between the route's read and the RPC.
    it("reports 409 when the RPC finds a term already running", async () => {
      scenario({ rpc: { error: { message: "ALREADY_ACTIVE" } } });
      await expect(readJson(await patch({ plan_type: "fixed_rate", term_months: 6 }))).resolves.toEqual({
        status: 409,
        body: { error: "Host already has an active Fixed Rate term" },
      });
    });
  });
});
