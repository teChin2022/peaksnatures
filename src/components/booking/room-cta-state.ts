export type RoomCtaState = "pick-dates" | "add" | "edit";

/** What a house card's main button does: wait for dates, add a house, or edit the line once every free unit is already in the cart. */
export function roomCtaState({ datesChosen, inCart, remaining }: { datesChosen: boolean; inCart: number; remaining: number | undefined }): RoomCtaState {
  if (!datesChosen) return "pick-dates";
  if (inCart > 0 && (remaining ?? 0) <= 0) return "edit";
  return "add";
}
