/** A house's base nightly price from the form field, or null when it is not a positive amount. */
export function parseRoomPrice(input: string): number | null {
  const price = parseInt(input.trim(), 10);
  return Number.isFinite(price) && price > 0 ? price : null;
}

export type RoomSubForm = "tier" | "option" | "season" | "special";

/**
 * The house dialog's sub-forms (in on-screen order) that hold input the host
 * never added with its own "เพิ่ม" button. Saving the house drops them, so the
 * dialog asks first.
 */
export function unaddedSections(forms: {
  tier: { adults: string; children: string; detail: string; surcharge: string; useDefaultPrice: boolean };
  option: { name: string; price: string };
  season: { name: string; start_date: string; end_date: string; price_per_night: string };
  special: { name: string; weekdays: number[]; dates: string[]; start_date: string; end_date: string; surcharge: string };
  editing: Record<RoomSubForm, boolean>;
}): RoomSubForm[] {
  const { tier, option, season, special, editing } = forms;
  const filled: Record<RoomSubForm, boolean> = {
    tier: tier.adults !== "2" || tier.children !== "0" || !!tier.detail.trim() || !!tier.surcharge.trim() || tier.useDefaultPrice,
    option: !!option.name.trim() || !!option.price.trim(),
    season: !!season.name.trim() || !!season.start_date || !!season.end_date || !!season.price_per_night.trim(),
    special: !!special.name.trim() || special.weekdays.length > 0 || special.dates.length > 0 || !!special.start_date || !!special.end_date || !!special.surcharge.trim(),
  };
  return (["tier", "option", "season", "special"] as const).filter((k) => filled[k] || editing[k]);
}
