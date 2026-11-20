import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, ExternalLink } from "lucide-react";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { isAdmin } from "@/lib/admin";
import { fmtTHB } from "@/lib/format-currency";
import { fmtBangkokTime } from "@/lib/format-date";
import { Card, CardContent } from "@/components/ui/card";
import { PageHeader } from "@/components/admin/page-header";
import { EmptyState } from "@/components/admin/empty-state";
import { Explainer } from "@/components/admin/explainer";
import { STICKY_END, TABLE, TABLE_CARD, TABLE_WRAP, TBODY, TD, TD_LEAD, TD_TRAIL, TH, TH_ROW, TR } from "@/components/admin/table-classes";
import { cn } from "@/lib/utils";
import { REJECTED_LIMIT, getRejectedPayments, type RejectedKind } from "./data";
import { SettleControl } from "./settle-control";

const KIND_LABELS: Record<RejectedKind, string> = {
  invoice: "Invoice payment",
  plan_activation: "Fixed Rate activation",
  wallet_topup: "Wallet top-up",
};
const num = "text-right tabular-nums whitespace-nowrap";
const baht = (n: number | null) => (n == null ? "—" : fmtTHB(n));

export default async function RejectedPaymentsPage() {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user || !(await isAdmin(user.id))) redirect("/");

  const payments = await getRejectedPayments();
  const waiting = payments.filter((p) => !p.settlement).length;

  return (
    <div>
      <Link
        href="/admin/billing"
        className="mb-3 inline-flex min-h-11 items-center gap-1.5 rounded text-sm text-earth-600 hover:text-brand focus:outline-none focus-visible:ring-2 focus-visible:ring-brand md:min-h-0"
      >
        <ArrowLeft className="h-4 w-4" />
        Billing
      </Link>
      <PageHeader subtitle={waiting > 0 ? `${waiting} to settle by hand` : "Settle by hand"} title="Rejected payments" />
      <Explainer className="-mt-3">
        Real transfers that EasySlip verified and the platform then refused. EasySlip now marks each slip as a
        duplicate, so the host cannot submit it again: settle each one by hand (top up the wallet, mark the invoice
        paid, set the plan, or refund), using the bank reference to find the transfer, then mark it settled.
      </Explainer>

      {payments.length === 0 ? (
        <EmptyState title="No rejected payments" description="Nothing is waiting to be settled." />
      ) : (
        // Rows on phones (host and amount, what it was for, the reference, then Settle full width), a table from md.
        <Card className={TABLE_CARD}>
          <CardContent className="p-0">
            <div className={TABLE_WRAP}>
              <table className={cn(TABLE, "md:min-w-[680px]")}>
                <thead>
                  <tr className={TH_ROW}>
                    <th scope="col" className={cn(TH, "md:max-xl:hidden")}>Date</th>
                    <th scope="col" className={TH}>Host</th>
                    <th scope="col" className={TH}>Payment</th>
                    <th scope="col" className={cn(TH, "text-right")}>Transferred</th>
                    <th scope="col" className={cn(TH, "text-right")}>Expected</th>
                    <th scope="col" className={TH}>Bank ref</th>
                    <th scope="col" className={cn(TH, "md:max-lg:hidden")}>Reason</th>
                    <th scope="col" className={cn(TH, STICKY_END)}>Status</th>
                  </tr>
                </thead>
                <tbody className={TBODY}>
                  {payments.map((p) => (
                    <tr key={p.id} className={cn(TR, p.settlement && "text-earth-600")}>
                      <td className={cn(TD, "whitespace-nowrap tabular-nums max-md:order-2 max-md:text-xs max-md:text-earth-600 md:max-xl:hidden")}>
                        {fmtBangkokTime(p.created_at)}
                      </td>
                      <td className={cn(TD_LEAD, "max-md:font-semibold")}>
                        {p.host_id ? (
                          <Link
                            href={`/admin/hosts/${p.host_id}`}
                            className="rounded underline-offset-4 hover:text-brand hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-brand"
                          >
                            {p.host_name ?? "Unknown host"}
                          </Link>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td className={TD}>{KIND_LABELS[p.kind]}</td>
                      <td className={cn(TD_TRAIL, num, "font-semibold", !p.settlement && "text-earth-900")}>{baht(p.slip_amount)}</td>
                      <td className={cn(TD, num, "max-md:text-left max-md:text-xs max-md:text-earth-600 max-md:before:content-['Expected_']")}>{baht(p.expected_amount)}</td>
                      <td className={cn(TD, "font-mono text-xs break-all max-md:mt-1")}>
                        {p.trans_ref ?? "—"}
                        {p.slip_url && (
                          <a
                            href={p.slip_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="mt-1 flex w-fit items-center gap-1 rounded font-sans text-earth-600 underline underline-offset-2 hover:text-brand focus:outline-none focus-visible:ring-2 focus-visible:ring-brand max-md:min-h-11"
                          >
                            View slip
                            <ExternalLink className="h-3 w-3" aria-hidden />
                            <span className="sr-only">(opens in a new tab)</span>
                          </a>
                        )}
                      </td>
                      <td className={cn(TD, "font-mono text-xs text-earth-600 md:max-lg:hidden")}>{p.reason ?? "—"}</td>
                      <td className={cn(TD, "max-md:order-3 max-md:mt-2", STICKY_END)}>
                        <SettleControl logId={p.id} hostName={p.host_name} settlement={p.settlement} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}
      {payments.length > 0 && <p className="mt-3 text-xs text-earth-600">Latest {REJECTED_LIMIT}.</p>}
    </div>
  );
}
