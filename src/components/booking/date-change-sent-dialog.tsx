"use client";

import { Clock } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { HostContactLinks } from "@/components/booking/host-contact-links";

export interface DateChangeSent {
  checkIn: string;
  checkOut: string;
  /** Set only when the guest asked for a different house. */
  roomName: string | null;
}

/**
 * Shown once a change request is sent: the change waits for the host, so the
 * guest is asked to call or message them about it.
 */
export function DateChangeSentDialog({
  sent,
  onClose,
  facebookUrl,
  hostPhone,
}: {
  sent: DateChangeSent | null;
  onClose: () => void;
  facebookUrl: string | null | undefined;
  hostPhone: string | null | undefined;
}) {
  const t = useTranslations("bookingSearch");

  return (
    <Dialog open={sent !== null} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="z-[70] sm:max-w-md" overlayClassName="z-[70]">
        <DialogHeader>
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-brand-50">
            <Clock className="h-6 w-6 text-brand" aria-hidden="true" />
          </div>
          <DialogTitle className="text-center">{t("dcSentTitle")}</DialogTitle>
          <DialogDescription className="text-center">{t("dcSentDesc")}</DialogDescription>
        </DialogHeader>
        {sent && (
          <div className="space-y-1 rounded-xl border border-earth-200 bg-earth-50 p-3 text-center text-sm text-earth-800">
            <p>{t("dcSentDates", { checkIn: sent.checkIn, checkOut: sent.checkOut })}</p>
            {sent.roomName && <p>{t("dcSentRoom", { room: sent.roomName })}</p>}
          </div>
        )}
        <HostContactLinks facebookUrl={facebookUrl} hostPhone={hostPhone} messengerLabel={t("dcSentChat")} />
        <DialogFooter>
          <Button variant="ghost" className="w-full min-h-11 text-earth-600" onClick={onClose}>
            {t("dcSentClose")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
