"use client";

import { useTranslations } from "next-intl";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { ReviewFormInline } from "@/components/reviews/review-form-inline";

interface ReviewFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  bookingId: string;
  guestEmail: string;
  homestayId: string;
  onSuccess: () => void;
}

export function ReviewForm({
  open,
  onOpenChange,
  bookingId,
  guestEmail,
  homestayId,
  onSuccess,
}: ReviewFormProps) {
  const t = useTranslations("reviews");

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="h-[92vh] overflow-y-auto rounded-t-2xl px-4 pb-8 sm:px-6">
        <SheetHeader className="pb-4">
          <SheetTitle className="text-lg">{t("writeReview")}</SheetTitle>
        </SheetHeader>
        <div className="mx-auto max-w-lg">
          <ReviewFormInline
            bookingId={bookingId}
            guestEmail={guestEmail}
            homestayId={homestayId}
            onSuccess={() => {
              onSuccess();
              onOpenChange(false);
            }}
          />
        </div>
      </SheetContent>
    </Sheet>
  );
}
