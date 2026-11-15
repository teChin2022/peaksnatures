export type RoomCtaState = "pick-dates" | "add" | "add-more" | "full";

/**
 * What a house card's main button does: wait for dates, choose the house, choose
 * one more unit of it, or nothing once every free unit is chosen (each chosen
 * unit is edited or removed on its own line on the card).
 */
export function roomCtaState({ datesChosen, inCart, remaining }: { datesChosen: boolean; inCart: number; remaining: number | undefined }): RoomCtaState {
  if (!datesChosen) return "pick-dates";
  if (inCart === 0) return "add";
  return (remaining ?? 0) > 0 ? "add-more" : "full";
}
