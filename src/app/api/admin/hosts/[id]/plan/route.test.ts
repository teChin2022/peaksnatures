import { beforeEach, describe, expect, it, vi } from "vitest";
import { PATCH } from "./route";
import { signIn, signOut, sessionError } from "../../../../../../../test/helpers/auth";
import { makeRequest, readJson } from "../../../../../../../test/helpers/request";
import { makeBillingConfig } from "../../../../../../../test/fixtures/db";
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
  /** Rows returned by the "does an invoice already block us" check. */
  openInvoices?: unknown[];
  hosts?: QueryResponse[];
  invoices?: QueryResponse[];
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
const scenario = ({ host = freeHost, openInvoices = [], hosts, invoices }: Scenario = {}) =>
  signIn(h, {
    tables: {
      platform_admins: { data: { name: "Root" } },
      hosts: hosts ?? [{ data: host }, {}],
      invoices: invoices ?? [{ data: openInvoices }, {}],
    },
  });

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

      expect(sc.builderFor("hosts", 1).update).toHaveBeenCalledWith(
        expect.objectContaining({
          plan_type: "fixed_rate",
          fixed_rate_term_months: 6,
          fixed_rate_term_started_at: "2026-09-20",
          fixed_rate_term_ends_at: "2027-03-31",
        }),
      );
      expect(sc.builderFor("invoices", 1).insert).toHaveBeenCalledWith(
        expect.objectContaining({
          host_id: HOST_ID,
          amount: 5767,
          period_start: "2026-09-20",
          period_end: "2027-03-31",
          term_months: 6,
          discount_pct: 10,
          due_date: "2026-09-25",
          status: "pending",
        }),
      );
    });

    it("falls back to a 1-month term when none is sent", async () => {
      const sc = scenario();

      const { body } = await readJson(await patch({ plan_type: "fixed_rate" }));
      expect(body).toMatchObject({ term_months: 1, term_started: true, amount: 367 });

      expect(sc.builderFor("hosts", 1).update).toHaveBeenCalledWith(
        expect.objectContaining({
          fixed_rate_term_months: 1,
          // A 1-month term buys only the rest of the current month.
          fixed_rate_term_ends_at: "2026-09-30",
        }),
      );
    });

    it("falls back to 1 month for a term that is not a configured tier", async () => {
      const sc = scenario();

      const { body } = await readJson(await patch({ plan_type: "fixed_rate", term_months: 9 }));
      expect(body).toMatchObject({ term_months: 1 });

      expect(sc.builderFor("hosts", 1).update).toHaveBeenCalledWith(
        expect.objectContaining({ fixed_rate_term_months: 1 }),
      );
      expect(sc.builderFor("hosts", 1).update).not.toHaveBeenCalledWith(
        expect.objectContaining({ fixed_rate_term_months: 9 }),
      );
    });

    it("records the chosen term in the audit log", async () => {
      scenario();
      await patch({ plan_type: "fixed_rate", term_months: 12 });
      for (const cb of h.afterCallbacks) await cb();

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
    });

    it("restarts the term once the old one has expired", async () => {
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
      expect(sc.builderFor("hosts", 1).update).toHaveBeenCalledWith(
        expect.objectContaining({ fixed_rate_term_months: 6 }),
      );
    });

    it("sets the term but skips the invoice when the host already has an open one", async () => {
      const sc = scenario({ openInvoices: [{ id: "inv-1" }] });

      const { body } = await readJson(await patch({ plan_type: "fixed_rate", term_months: 6 }));
      expect(body).toMatchObject({ term_started: true, invoice_created: false, amount: 5767 });

      expect(sc.builderFor("hosts", 1).update).toHaveBeenCalledWith(
        expect.objectContaining({ fixed_rate_term_months: 6 }),
      );
      // Only the open-invoice lookup — nothing was inserted on top of it.
      expect(sc.calls.filter((c) => c.table === "invoices")).toHaveLength(1);
    });

    it("prices the term off a per-host rate override", async () => {
      const sc = scenario({
        host: { plan_type: "free", fixed_rate_override: 2000, fixed_rate_term_ends_at: null },
      });

      await patch({ plan_type: "fixed_rate", term_months: 6 });
      expect(sc.builderFor("invoices", 1).insert).toHaveBeenCalledWith(
        expect.objectContaining({ amount: 733 + 10800 }),
      );
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

    it("reports 500 when the invoice insert fails", async () => {
      scenario({ invoices: [{ data: [] }, { error: { message: "constraint" } }] });
      await expect(readJson(await patch({ plan_type: "fixed_rate", term_months: 6 }))).resolves.toEqual({
        status: 500,
        body: { error: "Plan set but failed to create invoice" },
      });
    });
  });
});
