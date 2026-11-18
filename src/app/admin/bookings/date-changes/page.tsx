import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { isAdmin } from "@/lib/admin";
import { fmtTHB } from "@/lib/format-currency";
import { fmtBangkokTime, fmtDateStr } from "@/lib/format-date";
import { Card, CardContent } from "@/components/ui/card";
import { PageHeader } from "@/components/admin/page-header";
import { EmptyState } from "@/components/admin/empty-state";
import { StatusBadge } from "@/components/admin/status-badge";
import { STALE_DATE_CHANGE_DAYS } from "../../attention";
import { DATE_CHANGE_LIMIT, getPendingDateChanges } from "./data";

const day = (d: string) => fmtDateStr(d, "MMM d", "en");
const th = "px-4 py-2.5 font-medium";
const td = "px-4 py-2.5 align-top";

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
        className="mb-3 inline-flex items-center gap-1.5 rounded text-sm text-earth-600 hover:text-brand focus:outline-none focus-visible:ring-2 focus-visible:ring-brand"
      >
        <ArrowLeft className="h-4 w-4" />
        Bookings
      </Link>
      <PageHeader
        subtitle={stale > 0 ? `${stale} waiting over ${STALE_DATE_CHANGE_DAYS} days` : "Waiting on hosts"}
        title="Date change requests"
      />
      <p className="-mt-3 mb-5 max-w-2xl text-sm text-earth-600">
        Guests asked to move these stays and the host has not answered. Only the host can approve or reject one; a
        nudge to the host is the admin&apos;s part.
      </p>

      {requests.length === 0 ? (
        <EmptyState title="No pending date changes" description="Every request has an answer." />
      ) : (
        <Card className="border-earth-100 bg-white">
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] text-sm">
                <thead>
                  <tr className="border-b border-earth-100 text-left text-xs text-earth-600">
                    <th scope="col" className={th}>Requested</th>
                    <th scope="col" className={th}>Guest</th>
                    <th scope="col" className={th}>Homestay</th>
                    <th scope="col" className={th}>From → to</th>
                    <th scope="col" className={`${th} text-right`}>Price change</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-earth-100 text-earth-800">
                  {requests.map((r) => (
                    <tr key={r.id}>
                      <td className={`${td} whitespace-nowrap tabular-nums`}>
                        {fmtBangkokTime(r.created_at)}
                        {r.stale && <StatusBadge status="stale" tone="amber" label="Waiting" className="ml-1.5" />}
                      </td>
                      <td className={td}>{r.guest_name ?? "—"}</td>
                      <td className={td}>
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
                      </td>
                      <td className={`${td} whitespace-nowrap`}>
                        <span className="text-earth-600">
                          {day(r.old_check_in)}–{day(r.old_check_out)}
                        </span>{" "}
                        → {day(r.new_check_in)}–{day(r.new_check_out)}
                      </td>
                      <td className={`${td} text-right tabular-nums whitespace-nowrap`}>
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
      <p className="mt-3 text-xs text-earth-600">Oldest first, up to {DATE_CHANGE_LIMIT}.</p>
    </div>
  );
}
