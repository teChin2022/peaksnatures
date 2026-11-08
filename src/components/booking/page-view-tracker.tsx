"use client";

import { useEffect } from "react";
import { useLocale } from "next-intl";
import { DemandEvent } from "@/lib/demand-events";
import { trackDemandOnce } from "@/lib/demand-track";

/** Long enough to shed most crawler and prefetch loads without losing real guests. */
const PAGE_VIEW_DWELL_MS = 2000;

/**
 * Renders nothing. Records `page_view` after a short dwell. It needs no cart,
 * so the landing (/[slug]) renders it directly and the booking page
 * (/[slug]/book) through DemandTracker. Stats count distinct sessions, so a
 * guest who opens both pages is still one view.
 */
export function PageViewTracker({ homestayId }: { homestayId: string }) {
  const locale = useLocale();

  useEffect(() => {
    const timer = setTimeout(() => {
      trackDemandOnce(`page_view:${homestayId}`, {
        homestayId,
        eventType: DemandEvent.PAGE_VIEW,
        locale,
      });
    }, PAGE_VIEW_DWELL_MS);
    return () => clearTimeout(timer);
  }, [homestayId, locale]);

  return null;
}
