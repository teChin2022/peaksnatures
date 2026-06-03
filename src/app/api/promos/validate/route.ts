import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { createRateLimiter } from "@/lib/rate-limit";
import { computePromoDiscount, evaluatePromoCode } from "@/lib/promo-codes";
import type { PromoCode } from "@/types/database";

const limiter = createRateLimiter({ limit: 30, windowMs: 60_000 });

const schema = z.object({
  homestay_id: z.string().uuid(),
  code: z.string().min(1).max(64),
  subtotal: z.number().int().min(0),
  guest_phone: z.string().optional(),
  guest_email: z.string().email().optional(),
});

export async function POST(req: NextRequest) {
  const limited = await limiter.check(req);
  if (limited) return limited;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ valid: false, reason: "INVALID_BODY" }, { status: 400 });
  }

  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ valid: false, reason: "INVALID_BODY" }, { status: 400 });
  }

  const { homestay_id, code, subtotal, guest_phone, guest_email } = parsed.data;
  const supabase = createServiceRoleClient();

  // Master flag must be on for the homestay.
  const { data: homestayRow } = await supabase
    .from("homestays")
    .select("promo_codes_enabled")
    .eq("id", homestay_id)
    .single();

  const enabled = (homestayRow as { promo_codes_enabled: boolean } | null)?.promo_codes_enabled;
  if (!enabled) {
    return NextResponse.json({ valid: false, reason: "DISABLED" });
  }

  const normalized = code.trim().toUpperCase();

  const { data: promoRow } = await supabase
    .from("promo_codes")
    .select("*")
    .eq("homestay_id", homestay_id)
    .ilike("code", normalized)
    .maybeSingle();

  const promo = promoRow as unknown as PromoCode | null;
  if (!promo) {
    return NextResponse.json({ valid: false, reason: "NOT_FOUND" });
  }

  const verdict = evaluatePromoCode(promo, { now: new Date() });
  if (!verdict.ok) {
    return NextResponse.json({ valid: false, reason: verdict.reason });
  }

  // One-use-per-guest: search redemptions for this code matching phone or email.
  if (promo.one_use_per_guest && (guest_phone || guest_email)) {
    const trimmedPhone = guest_phone?.trim() || null;
    const trimmedEmail = guest_email?.trim().toLowerCase() || null;

    const orFilters: string[] = [];
    if (trimmedPhone) orFilters.push(`guest_phone.eq.${trimmedPhone}`);
    if (trimmedEmail) orFilters.push(`guest_email.eq.${trimmedEmail}`);

    if (orFilters.length > 0) {
      const { data: existing } = await supabase
        .from("promo_redemptions")
        .select("id")
        .eq("promo_code_id", promo.id)
        .or(orFilters.join(","))
        .limit(1);
      if (existing && existing.length > 0) {
        return NextResponse.json({ valid: false, reason: "ALREADY_USED" });
      }
    }
  }

  // Discount may be 0 for commission-only / pure-attribution codes — still valid.
  const discount = computePromoDiscount(promo, subtotal);

  return NextResponse.json({
    valid: true,
    code_id: promo.id,
    code: promo.code,
    discount_type: promo.discount_type,
    discount_value: promo.discount_value,
    discount_amount: discount,
  });
}
