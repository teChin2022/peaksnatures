import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

type Tone = "brand" | "earth" | "amber" | "destructive" | "muted";

const TONE_CLASSES: Record<Tone, string> = {
  brand:       "bg-brand-50 text-brand border-brand/15",
  earth:       "bg-earth-50 text-earth-700 border-earth-200/60",
  amber:       "bg-amber-50 text-amber-700 border-amber-200/70",
  destructive: "bg-destructive/10 text-destructive border-destructive/20",
  muted:       "bg-earth-100/60 text-earth-600 border-earth-200",
};

const STATUS_TONES: Record<string, Tone> = {
  // booking statuses
  verified:  "brand",
  confirmed: "brand",
  completed: "earth",
  pending:   "amber",
  cancelled: "destructive",
  rejected:  "destructive",
  // generic states
  active:    "brand",
  inactive:  "muted",
  approved:  "brand",
  expired:   "destructive",
  paid:      "brand",
  overdue:   "destructive",
};

/**
 * The tone classes for a status (or an explicit tone), for places that keep
 * their own badge markup: the host dashboard uses the admin tones so a colour
 * means the same status everywhere (ui-audit S12).
 */
export function statusToneClass(status: string, tone?: Tone): string {
  return TONE_CLASSES[tone ?? STATUS_TONES[status.toLowerCase()] ?? "muted"];
}

interface StatusBadgeProps {
  status: string;
  tone?: Tone;
  label?: string;
  icon?: React.ReactNode;
  className?: string;
}

export function StatusBadge({ status, tone, label, icon, className }: StatusBadgeProps) {
  const resolved = tone ?? STATUS_TONES[status.toLowerCase()] ?? "muted";
  return (
    <Badge
      className={cn(
        "border text-[10px] font-medium px-1.5 py-0.5 capitalize",
        TONE_CLASSES[resolved],
        className
      )}
    >
      {icon}
      {label ?? status}
    </Badge>
  );
}
