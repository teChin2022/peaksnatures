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
import { REPORT_DAYS, getGuestAiPlatform, getGuestAiReport, getGuestAiRequests, type GuestAiReportRow } from "./data";
import { GuestAiActions, GuestAiCapField, GuestAiCostRates, GuestAiPlatformControls } from "./guest-ai-actions";

const baht = (n: number) => `฿${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const tokens = (n: number) => n.toLocaleString("en-US");

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
  const rates = { in: platform?.cost_in_per_mtok ?? 0, out: platform?.cost_out_per_mtok ?? 0 };
  const report = await getGuestAiReport(rates);
  const total: GuestAiReportRow = report.reduce<GuestAiReportRow>(
    (t, r) => ({
      ...t,
      replies: t.replies + r.replies,
      input_tokens: t.input_tokens + r.input_tokens,
      output_tokens: t.output_tokens + r.output_tokens,
      est_cost: r.est_cost === null ? null : (t.est_cost ?? 0) + r.est_cost,
      charged: t.charged + r.charged,
      accrued: t.accrued + r.accrued,
    }),
    { host_id: "all", host_name: "All hosts", replies: 0, input_tokens: 0, output_tokens: 0, est_cost: null, charged: 0, accrued: 0 },
  );

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

      {/* Phase 5 (087): what the assistant costs in Gemini against what hosts paid. */}
      <section aria-labelledby="guest-ai-report" className="mt-10">
        <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 id="guest-ai-report" className="font-serif text-xl text-earth-900">
              Cost, last {REPORT_DAYS} days
            </h2>
            <p className="mt-1 max-w-prose text-xs text-earth-600">
              Tokens are Gemini&apos;s own counts per reply. The cost is an estimate at the rates you enter (baht per million
              tokens, from Google&apos;s price list); Google bills in USD. Charged is what nightly billing took from wallets;
              accrued is not charged yet.
            </p>
          </div>
          {platform && <GuestAiCostRates costIn={rates.in} costOut={rates.out} />}
        </div>
        {report.length === 0 ? (
          <EmptyState icon={MessageCircleQuestion} title="No replies yet" description={`Nothing in the last ${REPORT_DAYS} days.`} />
        ) : (
          <Card className="overflow-hidden border-earth-100 bg-white">
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[760px] text-sm">
                  <thead>
                    <tr className={TH_ROW}>
                      <th scope="col" className={TH}>Host</th>
                      <th scope="col" className={`${TH} text-right`}>Replies</th>
                      <th scope="col" className={`${TH} text-right`}>Tokens in</th>
                      <th scope="col" className={`${TH} text-right`}>Tokens out</th>
                      <th scope="col" className={`${TH} text-right`}>Est. Gemini cost</th>
                      <th scope="col" className={`${TH} text-right`}>Charged</th>
                      <th scope="col" className={`${TH} text-right`}>Accrued</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-earth-100 text-earth-800 tabular-nums">
                    {[total, ...report].map((r) => (
                      <tr key={r.host_id} className={r.host_id === "all" ? "bg-earth-50 font-semibold text-earth-900" : undefined}>
                        <td className={`${TD} font-sans`}>
                          {r.host_id === "all" ? (
                            r.host_name
                          ) : (
                            <Link
                              href={`/admin/hosts/${r.host_id}`}
                              className="rounded underline-offset-4 hover:text-brand hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-brand"
                            >
                              {r.host_name ?? "Unknown host"}
                            </Link>
                          )}
                        </td>
                        <td className={`${TD} text-right`}>{tokens(r.replies)}</td>
                        <td className={`${TD} text-right`}>{tokens(r.input_tokens)}</td>
                        <td className={`${TD} text-right`}>{tokens(r.output_tokens)}</td>
                        <td className={`${TD} text-right`}>{r.est_cost === null ? "Set rates" : baht(r.est_cost)}</td>
                        <td className={`${TD} text-right`}>{baht(r.charged)}</td>
                        <td className={`${TD} text-right`}>{baht(r.accrued)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        )}
      </section>
    </div>
  );
}
