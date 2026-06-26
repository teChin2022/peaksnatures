"use client";

import { useTranslations } from "next-intl";
import { AlertTriangle, CalendarDays, Home } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

interface LeaveBookingDialogProps {
  open: boolean;
  /** Keep the guest in the funnel (also fires on overlay click / Escape). */
  onContinue: () => void;
  /** Leave the site and discard the in-progress booking. */
  onLeave: () => void;
  roomName?: string | null;
  /** Pre-formatted, locale-aware, e.g. "Jun 26 – Jun 28". */
  dateLabel?: string | null;
  /** Pre-formatted, e.g. "2 nights". */
  nightsLabel?: string | null;
  /** Pre-formatted, e.g. "2 guests". */
  guestsLabel?: string | null;
}

export function LeaveBookingDialog({
  open,
  onContinue,
  onLeave,
  roomName,
  dateLabel,
  nightsLabel,
  guestsLabel,
}: LeaveBookingDialogProps) {
  const t = useTranslations("booking");
  const reduce = useReducedMotion();

  // Compact meta line — only the parts the guest has actually chosen.
  const meta = [dateLabel, nightsLabel, guestsLabel].filter(Boolean).join(" · ");
  const hasSummary = Boolean(roomName || meta);

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onContinue(); }}>
      <DialogContent
        showCloseButton={false}
        className="z-70 gap-0 overflow-hidden rounded-2xl border-earth-100 p-0 sm:max-w-md"
        overlayClassName="z-70 bg-earth-900/40 backdrop-blur-[2px]"
      >
        <div className="flex flex-col items-center px-6 pt-7 pb-6">
          <motion.div
            initial={reduce ? false : { scale: 0.85, opacity: 0 }}
            animate={reduce ? false : { scale: 1, opacity: 1 }}
            transition={{ duration: 0.25, ease: "easeOut" }}
            className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-amber-50 ring-8 ring-amber-100/50"
          >
            <AlertTriangle className="h-7 w-7 text-amber-500" strokeWidth={2.2} />
          </motion.div>

          <DialogHeader className="items-center">
            <DialogTitle className="text-center text-xl font-bold text-earth-900">
              {t("leaveTitle")}
            </DialogTitle>
            <DialogDescription className="text-center text-sm leading-relaxed text-earth-500">
              {t("leaveBody")}
            </DialogDescription>
          </DialogHeader>

          {hasSummary && (
            <motion.div
              initial={reduce ? false : { opacity: 0, y: 8 }}
              animate={reduce ? false : { opacity: 1, y: 0 }}
              transition={{ duration: 0.25, ease: "easeOut", delay: reduce ? 0 : 0.06 }}
              className="mt-5 w-full rounded-xl border border-earth-100 bg-earth-50 p-3.5"
            >
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.15em] text-earth-400">
                {t("leaveSummaryTitle")}
              </p>
              {roomName && (
                <div className="flex items-center gap-2.5">
                  <Home className="h-4 w-4 shrink-0 text-brand" />
                  <span className="truncate text-sm font-semibold text-earth-900">{roomName}</span>
                </div>
              )}
              {meta && (
                <div className="mt-1.5 flex items-center gap-2.5">
                  <CalendarDays className="h-4 w-4 shrink-0 text-brand" />
                  <span className="text-[13px] font-medium text-earth-600">{meta}</span>
                </div>
              )}
            </motion.div>
          )}
        </div>

        <DialogFooter className="flex-col gap-2 border-t border-earth-100 bg-earth-50/40 px-6 py-4 sm:flex-col">
          <Button
            onClick={onContinue}
            className="h-12 w-full cursor-pointer rounded-full bg-brand text-[15px] font-bold tracking-wide text-white shadow-sm transition-colors hover:bg-brand-hover"
          >
            {t("leaveStay")}
          </Button>
          <Button
            onClick={onLeave}
            variant="ghost"
            className="h-11 w-full cursor-pointer rounded-full text-sm font-medium text-earth-400 transition-colors hover:bg-earth-100 hover:text-earth-700"
          >
            {t("leaveConfirm")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
