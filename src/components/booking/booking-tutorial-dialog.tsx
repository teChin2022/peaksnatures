"use client";

import { useTranslations } from "next-intl";
import { CalendarDays, UserRound, ClipboardCheck, CreditCard, CheckCircle2 } from "lucide-react";
import { motion } from "motion/react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

interface BookingTutorialDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The host takes quick bookings only: the payment step has no slip upload and the host confirms. */
  quickOnly?: boolean;
}

// The /book flow (2026-11-14): pick dates and houses, the guest's details and consent,
// the review with full or deposit, then one payment page with the slip upload.
const STEPS = [
  { num: 1, icon: CalendarDays, titleKey: "step1Title", descKey: "step1Desc", highlight: false },
  { num: 2, icon: UserRound, titleKey: "step2Title", descKey: "step2Desc", highlight: false },
  { num: 3, icon: ClipboardCheck, titleKey: "step3Title", descKey: "step3Desc", highlight: false },
  { num: 4, icon: CreditCard, titleKey: "step4Title", descKey: "step4Desc", highlight: true },
] as const;
const LAST = STEPS.length;

export function BookingTutorialDialog({ open, onOpenChange, quickOnly = false }: BookingTutorialDialogProps) {
  const t = useTranslations("bookingTutorial");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto rounded-2xl">
        <DialogHeader>
          <DialogTitle className="text-xl font-bold text-ink">{t("title")}</DialogTitle>
          <DialogDescription className="text-ink-3">{t(quickOnly ? "introQuick" : "intro")}</DialogDescription>
        </DialogHeader>

        <div className="space-y-3 py-1">
          {STEPS.map((s, i) => {
            const Icon = s.icon;
            return (
              <motion.div
                key={s.num}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.08, duration: 0.25 }}
                className={`flex items-start gap-3 rounded-xl p-3 ${
                  s.highlight ? "bg-pine/5 ring-1 ring-pine/15" : "bg-mist"
                }`}
              >
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-pine text-sm font-bold text-white">
                  {s.num}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="mb-0.5 flex items-center gap-2">
                    <Icon className="h-4 w-4 shrink-0 text-pine" />
                    <h3 className="text-sm font-semibold text-ink">{t(quickOnly && s.num === LAST ? "step4TitleQuick" : s.titleKey)}</h3>
                    {s.highlight && <CheckCircle2 className="h-4 w-4 shrink-0 text-green-600" />}
                  </div>
                  <p className="text-[13px] leading-relaxed text-ink-3">{t(quickOnly && s.num === LAST ? "step4DescQuick" : s.descKey)}</p>
                </div>
              </motion.div>
            );
          })}
        </div>

        <DialogFooter>
          <Button
            onClick={() => onOpenChange(false)}
            className="w-full rounded-full bg-pine px-6 py-3.5 h-auto text-sm font-bold text-white hover:bg-pine-hover"
          >
            {t("cta")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
