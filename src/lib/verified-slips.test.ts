import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { claimVerifiedSlip, recordVerifiedSlip, releaseVerifiedSlip, VERIFIED_SLIP_TTL_MS } from "./verified-slips";
import { createSupabaseMock, type QueryResponse } from "../../test/helpers/supabase";

type Client = Parameters<typeof claimVerifiedSlip>[0];

const HASH = "a".repeat(64);
const NOW = new Date("2026-11-15T05:00:00Z");

/** EasySlip's receiver for a transfer to PromptPay 081-234-5678 (masked as EasySlip masks it). */
const receiver = (proxy = "xxx-xxx-5678", bank?: string) => ({
  bank: { id: "004", name: "Kasikorn", short: "KBANK" },
  account: {
    name: { th: "นาย สมชาย" },
    proxy: { type: "MSISDN", account: proxy },
    ...(bank ? { bank: { type: "BANKAC", account: bank } } : {}),
  },
});

const row = (over: Record<string, unknown> = {}) => ({
  amount: 2000,
  receiver: receiver(),
  verified_at: new Date(NOW.getTime() - 5 * 60_000).toISOString(),
  consumed_at: null,
  ...over,
});

const host: { promptpayId: string | null; bankAccountNumber: string | null } = {
  promptpayId: "0812345678",
  bankAccountNumber: null,
};

function client(found: QueryResponse, claimed: QueryResponse = { data: { slip_hash: HASH } }) {
  return createSupabaseMock({ tables: { verified_slips: [found, claimed] } });
}

const claim = (supabase: ReturnType<typeof createSupabaseMock>, amount = 2000, receiverOf = host) =>
  claimVerifiedSlip(supabase as unknown as Client, { slipHash: HASH, amount, ...receiverOf });

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.useRealTimers();
});

describe("claimVerifiedSlip", () => {
  it("claims a fresh slip for the exact amount, paid to this host", async () => {
    const supabase = client({ data: row() });

    expect(await claim(supabase)).toBe(true);

    const update = supabase.builderFor("verified_slips", 1);
    expect(update.update).toHaveBeenCalledWith({ consumed_at: NOW.toISOString() });
    expect(update.eq).toHaveBeenCalledWith("slip_hash", HASH);
    expect(update.is).toHaveBeenCalledWith("consumed_at", null);
  });

  it("matches a host who takes transfers to a bank account", async () => {
    const supabase = client({ data: row({ receiver: receiver("", "xxx-x-x1105-x") }) });

    expect(await claim(supabase, 2000, { promptpayId: null, bankAccountNumber: "123-4-51105-6" })).toBe(true);
  });

  it.each([
    ["a slip the server never saw (a made-up hash)", { data: null }],
    ["a slip already used for another payment", { data: row({ consumed_at: NOW.toISOString() }) }],
    ["a slip verified too long ago", { data: row({ verified_at: new Date(NOW.getTime() - VERIFIED_SLIP_TTL_MS - 1).toISOString() }) }],
    ["a slip for a different amount", { data: row({ amount: 1 }) }],
    ["a slip paid to someone else", { data: row({ receiver: receiver("xxx-xxx-9999") }) }],
    ["a slip with no receiver on record", { data: row({ receiver: null }) }],
    ["a read that failed", { error: { message: "boom" } }],
  ])("does not claim %s", async (_, found) => {
    const supabase = client(found as QueryResponse);

    expect(await claim(supabase)).toBe(false);
    expect(supabase.calls).toHaveLength(1);
  });

  it("refuses a host with no receiving account configured, rather than matching anything", async () => {
    const supabase = client({ data: row() });

    expect(await claim(supabase, 2000, { promptpayId: "", bankAccountNumber: null })).toBe(false);
  });

  // Two requests racing with the same slip: the conditional update lets only
  // one of them through.
  it("does not claim when another request consumed the slip first", async () => {
    const supabase = client({ data: row() }, { data: null });

    expect(await claim(supabase)).toBe(false);
  });
});

describe("recordVerifiedSlip", () => {
  it("records the slip without overwriting an existing row", async () => {
    const supabase = createSupabaseMock({ tables: { verified_slips: { data: null } } });

    await recordVerifiedSlip(supabase as unknown as Client, {
      slipHash: HASH,
      transRef: "TR1",
      amount: 2000,
      receiver: receiver(),
    });

    const insert = supabase.builderFor("verified_slips");
    expect(insert.upsert).toHaveBeenCalledWith(
      { slip_hash: HASH, trans_ref: "TR1", amount: 2000, receiver: receiver() },
      { onConflict: "slip_hash", ignoreDuplicates: true },
    );
  });

  it("logs a failed write instead of throwing", async () => {
    const supabase = createSupabaseMock({ tables: { verified_slips: { error: { message: "boom" } } } });

    await expect(
      recordVerifiedSlip(supabase as unknown as Client, { slipHash: HASH, transRef: null, amount: 1, receiver: null }),
    ).resolves.toBeUndefined();
    expect(console.error).toHaveBeenCalled();
  });
});

describe("releaseVerifiedSlip", () => {
  it("frees a claimed slip again", async () => {
    const supabase = createSupabaseMock({ tables: { verified_slips: { data: null } } });

    await releaseVerifiedSlip(supabase as unknown as Client, HASH);

    const update = supabase.builderFor("verified_slips");
    expect(update.update).toHaveBeenCalledWith({ consumed_at: null });
    expect(update.eq).toHaveBeenCalledWith("slip_hash", HASH);
  });
});
