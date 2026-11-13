export type BarStep = "dates" | "details" | "payment";

/**
 * The bottom booking bars (phone bar, desktop dock) show only while the guest is
 * still browsing: not in checkout, not over the footer, not while the booking
 * card is on screen (they would cover its step-1 button), and not while the date
 * panel under the hero is on screen (it already offers the same dates and button).
 */
export function isBookingBarVisible({
  footerInView,
  step,
  cardInView,
  panelInView,
}: {
  footerInView: boolean;
  step: BarStep;
  cardInView: boolean;
  panelInView: boolean;
}): boolean {
  return !footerInView && step === "dates" && !cardInView && !panelInView;
}
