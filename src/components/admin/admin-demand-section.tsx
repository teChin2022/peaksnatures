"use client";

import { useState } from "react";
import { DemandPanel, type DemandPanelLabels } from "@/components/dashboard/demand-panel";

/**
 * Platform view of the guest demand funnel — the same three blocks the host
 * sees, unscoped by default and narrowable to one homestay.
 *
 * A client wrapper exists for two reasons: /admin/page.tsx is an async Server
 * Component and cannot hold the filter state, and /admin/* is English-only so
 * the labels are a plain const rather than next-intl strings.
 */
const LABELS: DemandPanelLabels = {
  title: "Guest demand",
  subtitle: "How visitors move toward a booking",
  funnelTitle: "Booking funnel",
  topDatesTitle: "Most requested dates",
  topDatesHint: "Amber marks the share with no house available.",
  stages: {
    page_view: "Page views",
    calendar_view: "Viewed calendar",
    dates_selected: "Selected dates",
    step_dates: "Finished step 1",
    step_details: "Finished step 2",
    step_payment: "Reached step 3",
    slip_uploaded: "Uploaded slip",
    booking_submitted: "Booked",
  },
  sessions: "Visitors",
  conversion: "Conversion",
  lostDemand: "Lost demand",
  soldOutSuffix: "sold out",
  empty: "No demand data for this period yet.",
  error: "Couldn't load demand data. Refresh to try again.",
  ranges: { d7: "7d", d30: "30d", d90: "90d" },
};

export function AdminDemandSection({
  homestays,
}: {
  homestays: { id: string; name: string }[];
}) {
  const [homestayId, setHomestayId] = useState("");

  return (
    <DemandPanel
      endpoint={`/api/admin/demand${homestayId ? `?homestay_id=${homestayId}` : ""}`}
      labels={LABELS}
      locale="en"
      filter={
        <select
          value={homestayId}
          onChange={(e) => setHomestayId(e.target.value)}
          className="h-8 rounded-full border border-earth-500 bg-white px-3 text-xs text-earth-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2"
          aria-label="Filter by homestay"
        >
          <option value="">All homestays</option>
          {homestays.map((h) => (
            <option key={h.id} value={h.id}>
              {h.name}
            </option>
          ))}
        </select>
      }
    />
  );
}
