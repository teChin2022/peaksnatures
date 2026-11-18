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
import { REJECTED_LIMIT, getRejectedPayments, type RejectedKind } from "./data";
import { SettleControl } from "./settle-control";

const KIND_LABELS: Record<RejectedKind, string> = {
  invoice: "Invoice payment",
  plan_activation: "Fixed Rate activation",
  wallet_topup: "Wallet top-up",
};
const th = "px-4 py-2.5 font-medium";
const td = "px-4 py-2.5 align-top";
const num = `${td} text-right tabular-nums whitespace-nowrap`;
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
        className="mb-3 inline-flex items-center gap-1.5 rounded text-sm text-earth-600 hover:text-brand focus:outline-none focus-visible:ring-2 focus-visible:ring-brand/40"
      >
        <ArrowLeft className="h-4 w-4" />
        Billing
      </Link>
      <PageHeader eyebrow={waiting > 0 ? `${waiting} to settle by hand` : "Settle by hand"} title="Rejected payments" />
      <p className="-mt-3 mb-5 max-w-2xl text-sm text-earth-600">
        Real transfers that EasySlip verified and the platform then refused. EasySlip now marks each slip as a
        duplicate, so the host cannot submit it again: settle each one by hand (top up the wallet, mark the invoice
        paid, set the plan, or refund), using the bank reference to find the transfer, then mark it settled.
      </p>

      {payments.length === 0 ? (
        <EmptyState title="No rejected payments" description="Nothing is waiting to be settled." />
      ) : (
        <Card className="border-earth-100 bg-white">
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[860px] text-sm">
                <thead>
                  <tr className="border-b border-earth-100 text-left text-xs text-earth-500">
                    <th scope="col" className={th}>Date</th>
                    <th scope="col" className={th}>Host</th>
                    <th scope="col" className={th}>Payment</th>
                    <th scope="col" className={`${th} text-right`}>Transferred</th>
                    <th scope="col" className={`${th} text-right`}>Expected</th>
                    <th scope="col" className={th}>Bank ref</th>
                    <th scope="col" className={th}>Reason</th>
                    <th scope="col" className={th}>Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-earth-100 text-earth-800">
                  {payments.map((p) => (
                    <tr key={p.id} className={p.settlement ? "text-earth-500" : undefined}>
                      <td className={`${td} whitespace-nowrap tabular-nums`}>{fmtBangkokTime(p.created_at)}</td>
                      <td className={td}>
                        {p.host_id ? (
                          <Link
                            href={`/admin/hosts/${p.host_id}`}
                            className="rounded underline-offset-4 hover:text-brand hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-brand/40"
                          >
                            {p.host_name ?? "Unknown host"}
                          </Link>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td className={td}>{KIND_LABELS[p.kind]}</td>
                      <td className={`${num} font-semibold ${p.settlement ? "" : "text-earth-900"}`}>{baht(p.slip_amount)}</td>
                      <td className={num}>{baht(p.expected_amount)}</td>
                      <td className={`${td} font-mono text-xs break-all`}>
                        {p.trans_ref ?? "—"}
                        {p.slip_url && (
                          <a
                            href={p.slip_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="mt-1 flex items-center gap-1 rounded font-sans text-earth-600 underline underline-offset-2 hover:text-brand focus:outline-none focus-visible:ring-2 focus-visible:ring-brand/40"
                          >
                            View slip
                            <ExternalLink className="h-3 w-3" aria-hidden />
                            <span className="sr-only">(opens in a new tab)</span>
                          </a>
                        )}
                      </td>
                      <td className={`${td} font-mono text-xs text-earth-600`}>{p.reason ?? "—"}</td>
                      <td className={td}>
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
      <p className="mt-3 text-xs text-earth-500">Latest {REJECTED_LIMIT}.</p>
    </div>
  );
}
