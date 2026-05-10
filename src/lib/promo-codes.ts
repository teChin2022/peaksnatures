import type { PromoCode } from "@/types/database";

export type PromoVerdict =
  | { ok: true }
  | { ok: false; reason: "INACTIVE" | "NOT_STARTED" | "EXPIRED" | "MAX_USES" };

export function evaluatePromoCode(promo: PromoCode, opts?: { now?: Date }): PromoVerdict {
  if (!promo.is_active) return { ok: false, reason: "INACTIVE" };

  const now = opts?.now ?? new Date();
  const today = ymd(now);

  if (promo.start_at && today < promo.start_at) return { ok: false, reason: "NOT_STARTED" };
  if (promo.expires_at && today > promo.expires_at) return { ok: false, reason: "EXPIRED" };
  if (promo.max_uses !== null && promo.times_used >= promo.max_uses) {
    return { ok: false, reason: "MAX_USES" };
  }

  return { ok: true };
}

export function computePromoDiscount(promo: PromoCode, subtotal: number): number {
  if (subtotal <= 0) return 0;
  const value = Number(promo.discount_value || 0);
  if (!Number.isFinite(value) || value <= 0) return 0;

  const raw =
    promo.discount_type === "percentage"
      ? Math.floor((subtotal * value) / 100)
      : Math.floor(value);

  return Math.max(0, Math.min(raw, subtotal));
}

export function computeCommissionAmount(promo: PromoCode, subtotal: number): number {
  if (!promo.recommender_name || !promo.commission_type || promo.commission_value == null) return 0;
  if (subtotal <= 0) return 0;
  const value = Number(promo.commission_value);
  if (!Number.isFinite(value) || value <= 0) return 0;

  const raw =
    promo.commission_type === "percentage"
      ? Math.floor((subtotal * value) / 100)
      : Math.floor(value);

  return Math.max(0, raw);
}

function ymd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
