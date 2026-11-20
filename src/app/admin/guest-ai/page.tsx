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
import { Explainer } from "@/components/admin/explainer";
import { STICKY_END, TABLE, TABLE_CARD, TABLE_WRAP, TBODY, TD, TD_LEAD, TD_TRAIL, TH, TH_ROW, TR } from "@/components/admin/table-classes";
import { cn } from "@/lib/utils";
import { REPORT_DAYS, getGuestAiPlatform, getGuestAiReport, getGuestAiRequests, type GuestAiReportRow } from "./data";
import { GuestAiActions, GuestAiCapField, GuestAiCostRates, GuestAiPlatformControls } from "./guest-ai-actions";

const baht = (n: number) => `฿${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const tokens = (n: number) => n.toLocaleString("en-US");

/** "suspended" has no StatusBadge tone of its own; amber reads as "on hold". */
const TONE = { suspended: "amber" } as const;
/** Phones: a named figure, two to a line under the host. */
const PART = "text-right max-md:col-span-1 max-md:text-left max-md:text-xs max-md:text-earth-600";

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
        subtitle={waiting > 0 ? `${waiting} waiting for approval` : `${requests.length} host${requests.length === 1 ? "" : "s"}`}
      />
      <Explainer className="-mt-3">
        Hosts ask for the guest AI assistant on their booking page; approve it here. The host then turns it on and
        chooses what it may do. The daily cap is the most replies it gives a host&apos;s guests in a Bangkok day, and
        only admins set it. The platform cap below is the total over every host. Replies cost the host the price per reply,
        added up per day and charged to the wallet (rounded up) by the nightly cron; at ฿0 the assistant is free.
      </Explainer>

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
        // Rows on phones (host and status, switch and today, cap, dates, then the actions full width), a table from md.
        <Card className={TABLE_CARD}>
          <CardContent className="p-0">
            <div className={TABLE_WRAP}>
              <table className={cn(TABLE, "md:min-w-[680px]")}>
                <thead>
                  <tr className={TH_ROW}>
                    <th scope="col" className={cn(TH, "md:max-lg:hidden")}>Requested</th>
                    <th scope="col" className={TH}>Host</th>
                    <th scope="col" className={TH}>Status</th>
                    <th scope="col" className={TH}>Host switch</th>
                    <th scope="col" className={cn(TH, "text-right")}>Today</th>
                    <th scope="col" className={TH}>Daily cap</th>
                    <th scope="col" className={cn(TH, "md:max-xl:hidden")}>Decided</th>
                    <th scope="col" className={cn(TH, STICKY_END)}>Actions</th>
                  </tr>
                </thead>
                <tbody className={TBODY}>
                  {requests.map((r) => (
                    <tr key={r.host_id} className={TR}>
                      <td className={cn(TD, "whitespace-nowrap tabular-nums max-md:order-2 max-md:text-xs max-md:text-earth-600 max-md:before:content-['Requested_'] md:max-lg:hidden")}>
                        {fmtBangkokTime(r.requested_at)}
                      </td>
                      <td className={cn(TD_LEAD, "max-md:font-semibold max-md:text-earth-900")}>
                        <Link
                          href={`/admin/hosts/${r.host_id}`}
                          className="rounded underline-offset-4 hover:text-brand hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-brand"
                        >
                          {r.host_name ?? "Unknown host"}
                        </Link>
                      </td>
                      <td className={TD_TRAIL}>
                        <StatusBadge
                          status={r.status}
                          tone={r.status === "suspended" ? TONE.suspended : undefined}
                        />
                      </td>
                      <td className={cn(TD, "text-earth-600 max-md:col-span-1 max-md:mt-1 max-md:before:content-['Host_switch_']")}>
                        {r.status === "approved" ? (r.enabled ? "On" : "Off") : "—"}
                      </td>
                      <td className={cn(TD, "text-right tabular-nums whitespace-nowrap max-md:col-span-1 max-md:mt-1 max-md:before:content-['Today_']")}>
                        {r.replies_today}
                        {r.amount_today > 0 && <span className="block text-xs text-earth-600 max-md:inline max-md:before:content-['_·_']">฿{r.amount_today.toFixed(2)}</span>}
                      </td>
                      <td className={cn(TD, "max-md:mt-1")}>
                        <GuestAiCapField hostId={r.host_id} hostName={r.host_name} value={r.daily_reply_cap} />
                      </td>
                      <td className={cn(TD, "text-xs text-earth-600 max-md:order-2 md:max-xl:hidden", !r.decided_at && "max-md:hidden")}>
                        {r.decided_at ? (
                          <>
                            <span className="whitespace-nowrap tabular-nums max-md:before:content-['Decided_']">{fmtBangkokTime(r.decided_at)}</span>
                            {r.decided_by && <span className="block max-md:inline"> by {r.decided_by}</span>}
                          </>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td className={cn(TD, "max-md:order-3 max-md:mt-2", STICKY_END)}>
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
            <Explainer className="mb-0 mt-1 max-w-sm text-xs">
              Tokens are Gemini&apos;s own counts per reply. The cost is an estimate at the rates you enter (baht per million
              tokens, from Google&apos;s price list); Google bills in USD. Charged is what nightly billing took from wallets;
              accrued is not charged yet.
            </Explainer>
          </div>
          {platform && <GuestAiCostRates costIn={rates.in} costOut={rates.out} />}
        </div>
        {report.length === 0 ? (
          <EmptyState icon={MessageCircleQuestion} title="No replies yet" description={`Nothing in the last ${REPORT_DAYS} days.`} />
        ) : (
          // Phones: host and charged, then replies, accrued and the estimate; token counts from md.
          <Card className={TABLE_CARD}>
            <CardContent className="p-0">
              <div className={TABLE_WRAP}>
                <table className={cn(TABLE, "md:min-w-[680px]")}>
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
                  <tbody className={cn(TBODY, "tabular-nums")}>
                    {[total, ...report].map((r) => (
                      <tr key={r.host_id} className={cn(TR, r.host_id === "all" && "bg-earth-50 font-semibold text-earth-900")}>
                        <td className={cn(TD_LEAD, "font-sans")}>
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
                        <td className={cn(TD, PART, "max-md:before:content-['Replies_']")}>{tokens(r.replies)}</td>
                        <td className={cn(TD, "text-right max-md:hidden")}>{tokens(r.input_tokens)}</td>
                        <td className={cn(TD, "text-right max-md:hidden")}>{tokens(r.output_tokens)}</td>
                        <td className={cn(TD, "text-right max-md:order-1 max-md:text-left max-md:text-xs max-md:text-earth-600 max-md:before:content-['Est._Gemini_cost_']")}>
                          {r.est_cost === null ? "Set rates" : baht(r.est_cost)}
                        </td>
                        <td className={cn(TD_TRAIL, "text-right max-md:before:content-['Charged_']")}>{baht(r.charged)}</td>
                        <td className={cn(TD, PART, "max-md:before:content-['Accrued_']")}>{baht(r.accrued)}</td>
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
