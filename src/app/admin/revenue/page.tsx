import { redirect } from "next/navigation";
import { Banknote, CalendarRange, Receipt, Wallet, AlertTriangle } from "lucide-react";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { isAdmin } from "@/lib/admin";
import { fmtTHB } from "@/lib/format-currency";
import { Card, CardContent } from "@/components/ui/card";
import { PageHeader } from "@/components/admin/page-header";
import { KpiCard } from "@/components/admin/kpi-card";
import { Explainer } from "@/components/admin/explainer";
import { STICKY_START, TABLE, TABLE_CARD, TABLE_WRAP, TBODY, TD_LEAD, TD_TRAIL, TH, TH_ROW, TR } from "@/components/admin/table-classes";
import { cn } from "@/lib/utils";
import { REVENUE_MONTHS, getPlatformRevenue, monthLabel } from "./data";

const signed = (n: number) => (n === 0 ? fmtTHB(0) : `${n < 0 ? "−" : "+"}${fmtTHB(Math.abs(n))}`);
// A month can net negative when refunds outrun commission; fmtTHB alone would print "฿-5".
const money = (n: number) => (n < 0 ? `−${fmtTHB(-n)}` : fmtTHB(n));
const num = "px-4 py-2.5 text-right tabular-nums whitespace-nowrap";
/** Phones: a month's parts sit two to a line under it, each named (the header row is hidden). */
const part = `${num} max-md:p-0 max-md:text-left max-md:text-xs max-md:text-earth-600`;

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

      {/* Income on one row, money held by the platform on the next; five across from xl. */}
      <div className="grid grid-cols-6 gap-2 sm:gap-4 xl:grid-cols-5">
        <div className="col-span-3 xl:col-span-1"><KpiCard label={`Income, ${monthLabel(current.month)}`} value={money(current.income)} icon={Banknote} tone="brand" /></div>
        <div className="col-span-3 xl:col-span-1"><KpiCard label={`Income, last ${REVENUE_MONTHS} months`} value={money(yearIncome)} icon={CalendarRange} tone="brand" /></div>
        <div className="col-span-2 xl:col-span-1"><KpiCard label="Unpaid invoices" value={fmtTHB(unpaidInvoices)} icon={Receipt} tone={unpaidInvoices > 0 ? "amber" : "neutral"} href="/admin/billing" /></div>
        <div className="col-span-2 xl:col-span-1"><KpiCard label="Wallet money held" value={fmtTHB(walletHeld)} icon={Wallet} tone="earth" /></div>
        <div className="col-span-2 xl:col-span-1"><KpiCard label="Owed by hosts (wallets)" value={fmtTHB(walletOwed)} icon={AlertTriangle} tone={walletOwed > 0 ? "amber" : "neutral"} href="/admin/hosts" /></div>
      </div>

      <section className="mt-6">
        <h2 className="mb-1 text-sm font-semibold text-earth-900">By month</h2>
        <Explainer className="mb-3 max-w-sm text-xs">
          Income is commission charged minus commission refunded, plus Fixed Rate invoices paid, by Bangkok calendar
          month. Wallet top-ups are hosts&apos; prepaid money, not income. Admin wallet adjustments are shown but not counted.
        </Explainer>
        <Card className={TABLE_CARD}>
          <CardContent className="p-0">
            <div className={TABLE_WRAP}>
              <table className={TABLE}>
                <thead>
                  <tr className={TH_ROW}>
                    <th scope="col" className={cn(TH, STICKY_START)}>Month</th>
                    <th scope="col" className={cn(TH, "text-right")}>Income</th>
                    <th scope="col" className={cn(TH, "text-right")}>Commission</th>
                    <th scope="col" className={cn(TH, "text-right")}>Refunds</th>
                    <th scope="col" className={cn(TH, "text-right")}>Fixed Rate</th>
                    <th scope="col" className={cn(TH, "text-right")}>Adjustments</th>
                  </tr>
                </thead>
                <tbody className={TBODY}>
                  {newestFirst.map((m) => (
                    <tr key={m.month} className={TR}>
                      <th scope="row" className={cn(TD_LEAD, "text-left font-medium whitespace-nowrap text-earth-900 md:font-normal md:text-earth-800", STICKY_START)}>{monthLabel(m.month)}</th>
                      <td className={cn(TD_TRAIL, num, "max-md:p-0 font-semibold", m.income < 0 ? "text-red-700" : "text-earth-900")}>{money(m.income)}</td>
                      <td className={cn(part, "max-md:before:content-['Commission_']")}>{fmtTHB(m.commission)}</td>
                      <td className={cn(part, "max-md:before:content-['Refunds_']", m.refunds > 0 && "text-red-700 max-md:text-red-700")}>{m.refunds > 0 ? `−${fmtTHB(m.refunds)}` : fmtTHB(0)}</td>
                      <td className={cn(part, "max-md:before:content-['Fixed_Rate_']")}>{fmtTHB(m.fixedRate)}</td>
                      <td className={cn(part, "text-earth-600 max-md:before:content-['Adjustments_']")}>{signed(m.adjustments)}</td>
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
