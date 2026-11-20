import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

type Tone = "brand" | "earth" | "amber" | "neutral";

interface KpiCardProps {
  label: string;
  value: string | number;
  icon: LucideIcon;
  tone?: Tone;
  href?: string;
}

const TONE_STYLES: Record<Tone, { chip: string; icon: string }> = {
  brand:   { chip: "bg-brand-50 ring-1 ring-inset ring-brand/10",       icon: "text-brand" },
  earth:   { chip: "bg-earth-50 ring-1 ring-inset ring-earth-200/60",   icon: "text-earth-700" },
  amber:   { chip: "bg-amber-50 ring-1 ring-inset ring-amber-200/70",   icon: "text-amber-700" },
  neutral: { chip: "bg-earth-100/60 ring-1 ring-inset ring-earth-200",  icon: "text-earth-600" },
};

export function KpiCard({ label, value, icon: Icon, tone = "neutral", href }: KpiCardProps) {
  const styles = TONE_STYLES[tone];
  const card = (
    <Card
      className={cn(
        // h-full: cards in a row match when a label wraps to two lines.
        "dashboard-card h-full gap-0 border-earth-100 bg-white py-0",
        href && "cursor-pointer"
      )}
    >
      <CardContent className="flex items-center gap-3 p-3 sm:gap-4 sm:p-4">
        {/* Phones: no chip, so three figures fit one row. */}
        <div className={cn("hidden h-10 w-10 shrink-0 items-center justify-center rounded-lg sm:flex", styles.chip)}>
          <Icon className={cn("h-5 w-5", styles.icon)} />
        </div>
        <div className="min-w-0">
          <p className="text-xs sm:text-sm text-earth-600 line-clamp-2">{label}</p>
          <p className="text-xl sm:text-2xl font-bold text-earth-900 truncate tabular-nums">{value}</p>
        </div>
      </CardContent>
    </Card>
  );

  return href ? (
    <Link href={href} className="block h-full">
      {card}
    </Link>
  ) : (
    card
  );
}
