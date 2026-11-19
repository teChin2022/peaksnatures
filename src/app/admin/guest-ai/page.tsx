import Link from "next/link";
import { redirect } from "next/navigation";
import { MessageCircleQuestion } from "lucide-react";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { isAdmin } from "@/lib/admin";
import { fmtBangkokTime } from "@/lib/format-date";
import { Card, CardContent } from "@/components/ui/card";
import { PageHeader } from "@/components/admin/page-header";
import { EmptyState } from "@/components/admin/empty-state";
import { StatusBadge } from "@/components/admin/status-badge";
import { STICKY_END, TD, TH, TH_ROW } from "@/components/admin/table-classes";
import { getGuestAiPlatform, getGuestAiRequests } from "./data";
import { GuestAiActions, GuestAiCapField, GuestAiPlatformControls } from "./guest-ai-actions";

/** "suspended" has no StatusBadge tone of its own; amber reads as "on hold". */
const TONE = { suspended: "amber" } as const;

export default async function GuestAiPage() {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user || !(await isAdmin(user.id))) redirect("/");

  const [requests, platform] = await Promise.all([getGuestAiRequests(), getGuestAiPlatform()]);
  const waiting = requests.filter((r) => r.status === "requested").length;

  return (
    <div>
      <PageHeader
        title="Guest AI"
        subtitle={waiting > 0 ? `${waiting} waiting for approval` : `${requests.length} hosts`}
      />
      <p className="-mt-3 mb-5 max-w-prose text-sm text-earth-600">
        Hosts ask for the guest AI assistant on their booking page; approve it here. The host then turns it on and
        chooses what it may do. The daily cap is the most replies it gives a host&apos;s guests in a Bangkok day, and
        only admins set it. The platform cap below is the total over every host. Replies cost the host the price per reply,
        added up per day and charged to the wallet (rounded up) by the nightly cron; at ฿0 the assistant is free.
      </p>

      {platform && (
        <GuestAiPlatformControls
          enabled={platform.enabled}
          dailyCap={platform.daily_cap}
          pricePerReply={platform.price_per_reply}
          repliesToday={platform.replies_today}
        />
      )}

      {requests.length === 0 ? (
        <EmptyState icon={MessageCircleQuestion} title="No requests yet" description="Hosts ask from their dashboard." />
      ) : (
        <Card className="overflow-hidden border-earth-100 bg-white">
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[1020px] text-sm">
                <thead>
                  <tr className={TH_ROW}>
                    <th scope="col" className={TH}>Requested</th>
                    <th scope="col" className={TH}>Host</th>
                    <th scope="col" className={TH}>Status</th>
                    <th scope="col" className={TH}>Host switch</th>
                    <th scope="col" className={`${TH} text-right`}>Today</th>
                    <th scope="col" className={TH}>Daily cap</th>
                    <th scope="col" className={TH}>Decided</th>
                    <th scope="col" className={`${TH} ${STICKY_END}`}>Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-earth-100 text-earth-800">
                  {requests.map((r) => (
                    <tr key={r.host_id}>
                      <td className={`${TD} whitespace-nowrap tabular-nums`}>{fmtBangkokTime(r.requested_at)}</td>
                      <td className={TD}>
                        <Link
                          href={`/admin/hosts/${r.host_id}`}
                          className="rounded underline-offset-4 hover:text-brand hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-brand"
                        >
                          {r.host_name ?? "Unknown host"}
                        </Link>
                      </td>
                      <td className={TD}>
                        <StatusBadge
                          status={r.status}
                          tone={r.status === "suspended" ? TONE.suspended : undefined}
                          label={r.status.charAt(0).toUpperCase() + r.status.slice(1)}
                        />
                      </td>
                      <td className={`${TD} text-earth-600`}>{r.status === "approved" ? (r.enabled ? "On" : "Off") : "—"}</td>
                      <td className={`${TD} text-right tabular-nums whitespace-nowrap`}>
                        {r.replies_today}
                        {r.amount_today > 0 && <span className="block text-xs text-earth-600">฿{r.amount_today.toFixed(2)}</span>}
                      </td>
                      <td className={TD}>
                        <GuestAiCapField hostId={r.host_id} hostName={r.host_name} value={r.daily_reply_cap} />
                      </td>
                      <td className={`${TD} text-xs text-earth-600`}>
                        {r.decided_at ? (
                          <>
                            <span className="whitespace-nowrap tabular-nums">{fmtBangkokTime(r.decided_at)}</span>
                            {r.decided_by && <span className="block">by {r.decided_by}</span>}
                          </>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td className={`${TD} ${STICKY_END}`}>
                        <GuestAiActions
                          hostId={r.host_id}
                          hostName={r.host_name}
                          status={r.status}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
