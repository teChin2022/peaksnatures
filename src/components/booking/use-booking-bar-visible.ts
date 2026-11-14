"use client";

import { useEffect, useState } from "react";
import { isBookingBarVisible, type BarStep } from "@/components/booking/bar-visibility";

/**
 * Whether a bottom booking bar (phone bar or desktop dock) should show now.
 * Listens for BookingSection's step and card-on-screen events, and watches the
 * footer and the date panel (#date-panel); the rule itself is
 * isBookingBarVisible. `enabled` false skips the watching and returns false.
 */
export function useBookingBarVisible(enabled: boolean): boolean {
  const [step, setStep] = useState<BarStep>("dates");
  const [cardInView, setCardInView] = useState(false);
  const [footerInView, setFooterInView] = useState(false);
  const [panelInView, setPanelInView] = useState(false);

  useEffect(() => {
    const onStep = (e: Event) => setStep((e as CustomEvent<{ step: BarStep }>).detail.step);
    const onCard = (e: Event) => setCardInView((e as CustomEvent<{ inView: boolean }>).detail.inView);
    document.addEventListener("booking-step", onStep);
    document.addEventListener("booking-card-view", onCard);
    return () => {
      document.removeEventListener("booking-step", onStep);
      document.removeEventListener("booking-card-view", onCard);
    };
  }, []);

  useEffect(() => {
    if (!enabled || typeof IntersectionObserver === "undefined") return;
    const watch = (selector: string, set: (inView: boolean) => void) => {
      const el = document.querySelector(selector);
      if (!el) return null;
      const observer = new IntersectionObserver(([entry]) => set(entry.isIntersecting), { threshold: 0 });
      observer.observe(el);
      return observer;
    };
    const observers = [watch("footer", setFooterInView), watch("#date-panel", setPanelInView)];
    return () => observers.forEach((o) => o?.disconnect());
  }, [enabled]);

  return enabled && isBookingBarVisible({ footerInView, step, cardInView, panelInView });
}
