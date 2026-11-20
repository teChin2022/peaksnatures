import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, Phone } from "lucide-react";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { isAdmin } from "@/lib/admin";
import { fmtTHB } from "@/lib/format-currency";
import { fmtBangkokTime, fmtDateStr } from "@/lib/format-date";
import { Card, CardContent } from "@/components/ui/card";
import { PageHeader } from "@/components/admin/page-header";
import { EmptyState } from "@/components/admin/empty-state";
import { StatusBadge } from "@/components/admin/status-badge";
import { Explainer } from "@/components/admin/explainer";
import { TABLE, TABLE_CARD, TABLE_WRAP, TBODY, TD, TD_LEAD, TD_TRAIL, TH, TH_ROW, TR } from "@/components/admin/table-classes";
import { cn } from "@/lib/utils";
import { STALE_DATE_CHANGE_DAYS } from "../../attention";
import { DATE_CHANGE_LIMIT, getPendingDateChanges } from "./data";

const day = (d: string) => fmtDateStr(d, "MMM d", "en");

export default async function PendingDateChangesPage() {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user || !(await isAdmin(user.id))) redirect("/");

  const requests = await getPendingDateChanges();
  const stale = requests.filter((r) => r.stale).length;

  return (
    <div>
      <Link
        href="/admin/bookings"
        className="mb-3 inline-flex min-h-11 items-center gap-1.5 rounded text-sm text-earth-600 hover:text-brand focus:outline-none focus-visible:ring-2 focus-visible:ring-brand md:min-h-0"
      >
        <ArrowLeft className="h-4 w-4" />
        Bookings
      </Link>
      <PageHeader
        subtitle={stale > 0 ? `${stale} waiting over ${STALE_DATE_CHANGE_DAYS} days` : "Waiting on hosts"}
        title="Date change requests"
      />
      <Explainer className="-mt-3">
        Guests asked to move these stays and the host has not answered. Only the host can approve or reject one; a
        nudge to the host is the admin&apos;s part.
      </Explainer>

      {requests.length === 0 ? (
        <EmptyState title="No pending date changes" description="Every request has an answer." />
      ) : (
        // Rows on phones (guest and price change, homestay, dates, then when), a table from md.
        <Card className={TABLE_CARD}>
          <CardContent className="p-0">
            <div className={TABLE_WRAP}>
              <table className={cn(TABLE, "md:min-w-[680px]")}>
                <thead>
                  <tr className={TH_ROW}>
                    <th scope="col" className={TH}>Requested</th>
                    <th scope="col" className={TH}>Guest</th>
                    <th scope="col" className={TH}>Homestay</th>
                    <th scope="col" className={TH}>From → to</th>
                    <th scope="col" className={cn(TH, "text-right")}>Price change</th>
                  </tr>
                </thead>
                <tbody className={TBODY}>
                  {requests.map((r) => (
                    <tr key={r.id} className={TR}>
                      <td className={cn(TD, "whitespace-nowrap tabular-nums max-md:order-1 max-md:mt-1 max-md:text-xs max-md:text-earth-600")}>
                        {fmtBangkokTime(r.created_at)}
                        {r.stale && <StatusBadge status="stale" tone="amber" label="Waiting" className="ml-1.5" />}
                      </td>
                      <td className={cn(TD_LEAD, "max-md:font-semibold max-md:text-earth-900")}>{r.guest_name ?? "—"}</td>
                      <td className={TD}>
                        {r.host_id ? (
                          <Link
                            href={`/admin/hosts/${r.host_id}`}
                            className="rounded underline-offset-4 hover:text-brand hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-brand"
                          >
                            {r.homestay_name ?? "Unknown homestay"}
                          </Link>
                        ) : (
                          "—"
                        )}
                        {/* Only the host can answer: who to nudge, one tap to call. */}
                        {r.host_name && (
                          <p className="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-xs text-earth-600">
                            <span>Host {r.host_name}</span>
                            {r.host_phone && (
                              <a
                                href={`tel:${r.host_phone}`}
                                className="inline-flex items-center gap-1 rounded tabular-nums text-brand underline-offset-4 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-brand max-md:min-h-11"
                              >
                                <Phone className="h-3 w-3" aria-hidden />
                                {r.host_phone}
                              </a>
                            )}
                          </p>
                        )}
                      </td>
                      <td className={cn(TD, "whitespace-nowrap")}>
                        <span className="text-earth-600 line-through decoration-earth-400 md:no-underline">
                          {day(r.old_check_in)}–{day(r.old_check_out)}
                        </span>{" "}
                        → {day(r.new_check_in)}–{day(r.new_check_out)}
                      </td>
                      <td className={cn(TD_TRAIL, "text-right tabular-nums whitespace-nowrap")}>
                        {r.price_difference === 0
                          ? fmtTHB(0)
                          : `${r.price_difference < 0 ? "−" : "+"}${fmtTHB(Math.abs(r.price_difference))}`}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}
      {requests.length > 0 && <p className="mt-3 text-xs text-earth-600">Oldest first, up to {DATE_CHANGE_LIMIT}.</p>}
    </div>
  );
}
