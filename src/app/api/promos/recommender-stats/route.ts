import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { createRateLimiter } from "@/lib/rate-limit";

const limiter = createRateLimiter({ limit: 30, windowMs: 60_000 });

const schema = z.object({
  phone: z.string().min(1).max(32),
});

interface CodeAggregate {
  id: string;
  code: string;
  homestay_name: string;
  total_redemptions: number;
  total_commission: number;
  paid_commission: number;
  pending_commission: number;
}

interface RecentActivity {
  id: string;
  code: string;
  homestay_name: string;
  commission_amount: number;
  payout_status: "pending" | "paid" | "cancelled";
  created_at: string;
}

export async function POST(req: NextRequest) {
  const limited = limiter.check(req);
  if (limited) return limited;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, reason: "INVALID_BODY" }, { status: 400 });
  }

  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, reason: "INVALID_BODY" }, { status: 400 });
  }

  const digits = parsed.data.phone.replace(/\D/g, "");
  // 7-digit floor matches the SMS-kub lower bound; tighter than 1 to deter scraping.
  if (digits.length < 7) {
    return NextResponse.json({ ok: false, reason: "INVALID_PHONE" });
  }

  const sc = createServiceRoleClient();

  const { data: codeRows, error: codeErr } = await sc
    .from("promo_codes")
    .select("id, code, homestay:homestays(name)")
    .eq("recommender_phone", digits)
    .order("created_at", { ascending: false });

  if (codeErr) {
    console.error("[RecommenderStats] code lookup error:", codeErr);
    return NextResponse.json({ ok: false, reason: "INTERNAL" }, { status: 500 });
  }

  const codes = (codeRows as unknown as { id: string; code: string; homestay: { name: string } | null }[]) || [];

  if (codes.length === 0) {
    return NextResponse.json({
      ok: true,
      phone: digits,
      codes: [],
      recent_activity: [],
    });
  }

  const codeIds = codes.map((c) => c.id);

  // Aggregate redemptions for these codes.
  const { data: redemptionRows, error: redErr } = await sc
    .from("promo_redemptions")
    .select("id, promo_code_id, commission_amount, payout_status, created_at")
    .in("promo_code_id", codeIds)
    .order("created_at", { ascending: false });

  if (redErr) {
    console.error("[RecommenderStats] redemption lookup error:", redErr);
    return NextResponse.json({ ok: false, reason: "INTERNAL" }, { status: 500 });
  }

  const redemptions = (redemptionRows as unknown as {
    id: string;
    promo_code_id: string;
    commission_amount: number;
    payout_status: "pending" | "paid" | "cancelled";
    created_at: string;
  }[]) || [];

  // Aggregate per code.
  const aggregates = new Map<string, CodeAggregate>();
  for (const c of codes) {
    aggregates.set(c.id, {
      id: c.id,
      code: c.code,
      homestay_name: c.homestay?.name || "—",
      total_redemptions: 0,
      total_commission: 0,
      paid_commission: 0,
      pending_commission: 0,
    });
  }
  for (const r of redemptions) {
    const agg = aggregates.get(r.promo_code_id);
    if (!agg) continue;
    if (r.payout_status === "cancelled") continue;
    agg.total_redemptions += 1;
    agg.total_commission += r.commission_amount;
    if (r.payout_status === "paid") {
      agg.paid_commission += r.commission_amount;
    } else if (r.payout_status === "pending") {
      agg.pending_commission += r.commission_amount;
    }
  }

  // Recent activity: last 50, no guest PII.
  const codeNameById = new Map(codes.map((c) => [c.id, { code: c.code, homestay_name: c.homestay?.name || "—" }]));
  const recent_activity: RecentActivity[] = redemptions
    .slice(0, 50)
    .map((r) => {
      const meta = codeNameById.get(r.promo_code_id);
      return {
        id: r.id,
        code: meta?.code || "—",
        homestay_name: meta?.homestay_name || "—",
        commission_amount: r.commission_amount,
        payout_status: r.payout_status,
        created_at: r.created_at,
      };
    });

  return NextResponse.json({
    ok: true,
    phone: digits,
    codes: Array.from(aggregates.values()),
    recent_activity,
  }, { headers: { "Cache-Control": "private, no-store" } });
}
