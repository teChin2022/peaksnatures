import { Gift } from "lucide-react";
import { useTranslations } from "next-intl";

/** The referral code a ?promo= link brought (getPromoLinkInfo; data.ts is server only, so not imported). */
export interface PromoLink {
  code: string;
  discount_type: "percentage" | "fixed";
  discount_value: number;
  recommender_name: string | null;
}

/** Tells a guest who came by a ?promo= link that their code is on; the checkout applies it. */
export function PromoLinkBanner({ promo, className = "" }: { promo: PromoLink; className?: string }) {
  const tb = useTranslations("booking");
  return (
    <div className={`flex items-start gap-2.5 rounded-xl bg-pine-mist p-3.5 ${className}`}>
      <Gift className="mt-0.5 h-4 w-4 shrink-0 text-pine" aria-hidden />
      <p className="text-sm leading-snug text-ink">
        <span className="font-semibold">{tb("promoFromLinkBanner", { code: promo.code })}</span>
        {promo.discount_value > 0 &&
          (promo.discount_type === "percentage"
            ? tb("promoFromLinkDiscountPct", { value: promo.discount_value })
            : tb("promoFromLinkDiscountFixed", { value: promo.discount_value.toLocaleString() }))}
        {promo.recommender_name && <span className="text-ink-2">{tb("promoFromLinkRef", { name: promo.recommender_name })}</span>}
      </p>
    </div>
  );
}
