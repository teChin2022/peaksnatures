/** A house's base nightly price from the form field, or null when it is not a positive amount. */
export function parseRoomPrice(input: string): number | null {
  const price = parseInt(input.trim(), 10);
  return Number.isFinite(price) && price > 0 ? price : null;
}
