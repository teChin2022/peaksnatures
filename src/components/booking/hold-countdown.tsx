"use client";

import { useEffect, useState } from "react";
import { Clock } from "lucide-react";
import { useTranslations } from "next-intl";

export type HoldTone = "normal" | "warning" | "urgent";

/** Calm until 2:00 is left, amber from 2:00, red from 1:00. */
export function holdTone(secondsLeft: number): HoldTone {
  return secondsLeft <= 60 ? "urgent" : secondsLeft <= 120 ? "warning" : "normal";
}

const TONE_CLASS: Record<HoldTone, string> = {
  normal: "bg-mist-2 text-ink",
  warning: "bg-amber-50 text-amber-800",
  urgent: "bg-red-50 text-red-700",
};

/** The chip itself, for a given number of seconds left. */
export function HoldCountdownView({ timeLeft }: { timeLeft: number }) {
  const t = useTranslations("booking");
  if (timeLeft <= 0) return null;
  const time = `${Math.floor(timeLeft / 60)}:${String(timeLeft % 60).padStart(2, "0")}`;
  return (
    <div role="timer" className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold ${TONE_CLASS[holdTone(timeLeft)]}`}>
      <Clock className="h-3.5 w-3.5 shrink-0" />
      <span>{t("holdTimer")} {time}</span>
      {/* Announce only when the clock crosses 2:00 and 1:00: a live region that changes every second is unusable. */}
      <span aria-live="polite" className="sr-only">{timeLeft === 120 || timeLeft === 60 ? `${t("holdTimer")} ${time}` : ""}</span>
    </div>
  );
}

export function HoldCountdown({ expiresAt, onExpire }: { expiresAt: number | null; onExpire: () => void }) {
  const [timeLeft, setTimeLeft] = useState(0);
  useEffect(() => {
    if (!expiresAt) { setTimeLeft(0); return; }
    const tick = () => {
      const remaining = Math.max(0, Math.floor((expiresAt - Date.now()) / 1000));
      setTimeLeft(remaining);
      if (remaining <= 0) { clearInterval(id); onExpire(); }
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [expiresAt, onExpire]);

  return <HoldCountdownView timeLeft={timeLeft} />;
}
