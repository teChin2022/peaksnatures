/*
 * Admin tables, mobile first (owner, 2026-11-20): below md each table is a list
 * of rows from the same markup (no second copy of the cells or their buttons);
 * from md it is a table. In a phone row the first cell (TD_LEAD) shares its line
 * with TD_TRAIL on the right (an amount or a switch); every other TD takes a
 * full line, and TD_HIDE drops a column the row already says elsewhere.
 */

/** A Card holding a table: no shadcn padding band above and below the rows. */
export const TABLE_CARD = "gap-0 overflow-hidden border-earth-100 bg-white py-0";
/**
 * The table's scroll box (from md a wide table can still scroll). `relative` keeps
 * an sr-only label inside it: with no positioned ancestor it sat at its column's
 * x and widened the whole page (Guest AI, 290px at 375).
 */
export const TABLE_WRAP = "relative md:overflow-x-auto";
export const TABLE = "w-full text-sm max-md:block";
export const TBODY = "divide-y divide-earth-100 text-earth-800 max-md:block";
export const TR =
  "align-top max-md:grid max-md:grid-cols-[minmax(0,1fr)_auto] max-md:gap-x-3 max-md:gap-y-1 max-md:px-4 max-md:py-3.5";

/** Header row and cell padding. The header row is the table's: phones have none. */
export const TH_ROW = "border-b border-earth-100 text-left text-xs text-earth-600 max-md:hidden";
export const TH = "px-4 py-2.5 font-medium";
export const TD = "px-4 py-3 max-md:col-span-2 max-md:p-0";
export const TD_LEAD = "px-4 py-3 max-md:p-0";
export const TD_TRAIL = "px-4 py-3 max-md:col-start-2 max-md:row-start-1 max-md:p-0 max-md:text-right";
export const TD_HIDE = "px-4 py-3 max-md:hidden";

/**
 * Pinned columns, from md only (phones have no sideways scroll to pin against).
 * The inset shadow is the column's edge: a border would not move with a sticky cell.
 */
export const STICKY_END = "md:sticky md:right-0 md:bg-white md:shadow-[inset_1px_0_0_var(--color-earth-100)]";
export const STICKY_START = "md:sticky md:left-0 md:z-10 md:bg-white md:shadow-[inset_-1px_0_0_var(--color-earth-100)]";

/** 44px targets on phones for buttons that are 32-36px in the desktop rows. */
export const PHONE_TAP = "max-md:h-11 max-md:px-4";
/** Row actions on a phone: full-width buttons on their own line. */
export const PHONE_ACTIONS = "flex flex-wrap gap-1.5 max-md:mt-2 max-md:grid max-md:auto-cols-fr max-md:grid-flow-col";
