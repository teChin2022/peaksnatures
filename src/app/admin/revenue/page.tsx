import { redirect } from "next/navigation";
import { Banknote, CalendarRange, Receipt, Wallet, AlertTriangle } from "lucide-react";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { isAdmin } from "@/lib/admin";
import { fmtTHB } from "@/lib/format-currency";
import { Card, CardContent } from "@/components/ui/card";
import { PageHeader } from "@/components/admin/page-header";
import { KpiCard } from "@/components/admin/kpi-card";
import { STICKY_START } from "@/components/admin/table-classes";
import { REVENUE_MONTHS, getPlatformRevenue, monthLabel } from "./data";

const signed = (n: number) => (n === 0 ? fmtTHB(0) : `${n < 0 ? "−" : "+"}${fmtTHB(Math.abs(n))}`);
// A month can net negative when refunds outrun commission; fmtTHB alone would print "฿-5".
const money = (n: number) => (n < 0 ? `−${fmtTHB(-n)}` : fmtTHB(n));
const th = "px-4 py-2.5 font-medium";
const num = "px-4 py-2.5 text-right tabular-nums whitespace-nowrap";

export default async function AdminRevenuePage() {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user || !(await isAdmin(user.id))) redirect("/");

  const { months, walletHeld, walletOwed, unpaidInvoices } = await getPlatformRevenue();
  const current = months[months.length - 1];
  const yearIncome = months.reduce((sum, m) => sum + m.income, 0);
  const newestFirst = [...months].reverse();

  return (
    <div>
      <PageHeader subtitle="Platform income" title="Revenue" />

      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-3">
        <KpiCard label={`Income, ${monthLabel(current.month)}`} value={money(current.income)} icon={Banknote} tone="brand" />
        <KpiCard label={`Income, last ${REVENUE_MONTHS} months`} value={money(yearIncome)} icon={CalendarRange} tone="brand" />
        <KpiCard label="Unpaid invoices" value={fmtTHB(unpaidInvoices)} icon={Receipt} tone={unpaidInvoices > 0 ? "amber" : "neutral"} href="/admin/billing" />
        <KpiCard label="Wallet money held" value={fmtTHB(walletHeld)} icon={Wallet} tone="earth" />
        <KpiCard label="Owed by hosts (wallets)" value={fmtTHB(walletOwed)} icon={AlertTriangle} tone={walletOwed > 0 ? "amber" : "neutral"} href="/admin/hosts" />
      </div>

      <section className="mt-6">
        <h2 className="mb-1 text-sm font-semibold text-earth-900">By month</h2>
        <p className="mb-3 max-w-prose text-xs text-earth-600">
          Income is commission charged minus commission refunded, plus Fixed Rate invoices paid, by Bangkok calendar
          month. Wallet top-ups are hosts&apos; prepaid money, not income. Admin wallet adjustments are shown but not counted.
        </p>
        <Card className="overflow-hidden border-earth-100 bg-white">
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[560px] text-sm">
                <thead>
                  <tr className="border-b border-earth-100 text-left text-xs text-earth-600">
                    <th scope="col" className={`${th} ${STICKY_START}`}>Month</th>
                    <th scope="col" className={`${th} text-right`}>Income</th>
                    <th scope="col" className={`${th} text-right`}>Commission</th>
                    <th scope="col" className={`${th} text-right`}>Refunds</th>
                    <th scope="col" className={`${th} text-right`}>Fixed Rate</th>
                    <th scope="col" className={`${th} text-right`}>Adjustments</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-earth-100 text-earth-800">
                  {newestFirst.map((m) => (
                    <tr key={m.month}>
                      <th scope="row" className={`px-4 py-2.5 text-left font-normal whitespace-nowrap ${STICKY_START}`}>{monthLabel(m.month)}</th>
                      <td className={`${num} font-semibold ${m.income < 0 ? "text-red-700" : "text-earth-900"}`}>{money(m.income)}</td>
                      <td className={num}>{fmtTHB(m.commission)}</td>
                      <td className={`${num} ${m.refunds > 0 ? "text-red-700" : ""}`}>{m.refunds > 0 ? `−${fmtTHB(m.refunds)}` : fmtTHB(0)}</td>
                      <td className={num}>{fmtTHB(m.fixedRate)}</td>
                      <td className={`${num} text-earth-600`}>{signed(m.adjustments)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
