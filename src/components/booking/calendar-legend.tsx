import { cn } from "@/lib/utils";

/**
 * One calendar language for the guest pages (ui-audit B13): the availability
 * grid, the date picker and the house card's "วันว่าง & ราคา" calendar share
 * these swatches and this booked-night style.
 *
 * Booked nights are struck through as well as tinted, so status never rests
 * on colour alone; red-700 on red-100 keeps the number at 4.5:1.
 */
export const LEGEND_SWATCH = {
  free: "bg-white ring-line-strong",
  partial: "bg-amber-100 ring-amber-300",
  full: "bg-red-100 ring-red-300",
} as const;

/**
 * The booked-night look, for a day button. The strike is a solid 2px red-500:
 * the font's ~1px line at 60% vanished into the red-100 fill on 1x screens.
 */
export const BOOKED_DAY = "bg-red-100 text-red-700 line-through decoration-red-500 decoration-2";

/** The same look as a react-day-picker modifier class (it styles the cell's `.day-btn`). */
export const BOOKED_DAY_MODIFIER =
  "[&_.day-btn]:bg-red-100! [&_.day-btn]:text-red-700! [&_.day-btn]:line-through [&_.day-btn]:decoration-red-500 [&_.day-btn]:decoration-2";

export function CalendarLegend({
  items,
  className,
}: {
  items: { swatch: string; label: string }[];
  className?: string;
}) {
  return (
    <div className={cn("flex flex-wrap items-center justify-center gap-x-4 gap-y-2 text-xs text-ink-2", className)}>
      {items.map(({ swatch, label }) => (
        <span key={label} className="inline-flex items-center gap-1.5">
          <span className={cn("size-3.5 rounded-full ring-1 ring-inset", swatch)} />
          {label}
        </span>
      ))}
    </div>
  );
}
