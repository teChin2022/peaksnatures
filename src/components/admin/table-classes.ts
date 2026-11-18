/**
 * Pinned columns for admin tables that scroll sideways on phones and tablets.
 * The inset shadow is the column's edge: a border would not move with a sticky cell.
 */
export const STICKY_END = "sticky right-0 bg-white shadow-[inset_1px_0_0_var(--color-earth-100)]";
export const STICKY_START = "sticky left-0 z-10 bg-white shadow-[inset_-1px_0_0_var(--color-earth-100)]";

/** Header row and cell padding shared by the admin tables. */
export const TH_ROW = "border-b border-earth-100 text-left text-xs text-earth-600";
export const TH = "px-4 py-2.5 font-medium";
export const TD = "px-4 py-3";
