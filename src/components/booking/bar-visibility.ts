export type BarStep = "dates" | "details" | "payment";

/** The mobile sticky bar shows only while the guest is still browsing: not in checkout, not over the footer, and not while the booking card is on screen (it would cover the step-1 button). */
export function isBookingBarVisible({ footerInView, step, cardInView }: { footerInView: boolean; step: BarStep; cardInView: boolean }): boolean {
  return !footerInView && step === "dates" && !cardInView;
}
