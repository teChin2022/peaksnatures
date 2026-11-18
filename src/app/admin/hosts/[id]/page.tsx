import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft, ExternalLink, Mail, Phone } from "lucide-react";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { isAdmin } from "@/lib/admin";
import { fmtTHB } from "@/lib/format-currency";
import { fmtBangkokTime, fmtDateStr } from "@/lib/format-date";
import { getPlanExpiryInfo } from "@/lib/plan-expiry";
import { Card, CardContent } from "@/components/ui/card";
import { PageHeader } from "@/components/admin/page-header";
import { StatusBadge } from "@/components/admin/status-badge";
import { DETAIL_LIMITS, getAdminHostDetail } from "./data";

const PLAN_LABELS: Record<string, string> = { free: "Free", commission: "Commission", fixed_rate: "Fixed Rate" };
const day = (d: string) => fmtDateStr(d, "MMM d, yyyy", "en");
const signedTHB = (n: number) => `${n < 0 ? "−" : "+"}${fmtTHB(Math.abs(n))}`;

function Section({ title, note, children }: { title: string; note?: string; children: React.ReactNode }) {
  return (
    <section className="mt-6">
      <div className="mb-2 flex items-baseline justify-between gap-3">
        <h2 className="text-sm font-semibold text-earth-900">{title}</h2>
        {note && <p className="text-xs text-earth-500">{note}</p>}
      </div>
      <Card className="border-earth-100 bg-white">
        <CardContent className="p-0">{children}</CardContent>
      </Card>
    </section>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="px-4 py-6 text-sm text-earth-500">{children}</p>;
}

/** A dense table that scrolls sideways inside its card on a phone, never the page. */
function Table({ head, numeric, children }: { head: string[]; numeric: string[]; children: React.ReactNode }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[560px] text-sm">
        <thead>
          <tr className="border-b border-earth-100 text-left text-xs text-earth-500">
            {head.map((h) => (
              <th key={h} scope="col" className={`px-4 py-2.5 font-medium ${numeric.includes(h) ? "text-right" : ""}`}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-earth-100 text-earth-800">{children}</tbody>
      </table>
    </div>
  );
}

const td = "px-4 py-2.5 align-top";
const tdNum = `${td} text-right tabular-nums whitespace-nowrap`;

export default async function AdminHostDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user || !(await isAdmin(user.id))) redirect("/");

  const { id } = await params;
  const detail = await getAdminHostDetail(id);
  if (!detail) notFound();
  const { host, blocked, homestays, staff, wallet, invoices, bookings, logs } = detail;

  const planNote =
    host.plan_type === "fixed_rate" && host.fixed_rate_term_ends_at
      ? `${host.fixed_rate_term_months ?? "?"}-month term, ends ${day(host.fixed_rate_term_ends_at)}`
      : host.plan_type === "free" && host.plan_free_expires_at
        ? `${getPlanExpiryInfo(host.plan_type, host.plan_free_expires_at).phase === "active" ? "Free until" : "Free ended"} ${day(host.plan_free_expires_at.slice(0, 10))}`
        : null;
  const overrides = [
    host.commission_pct_override != null && `${host.commission_pct_override}% guest commission`,
    host.quick_commission_pct_override != null && `${host.quick_commission_pct_override}% quick commission`,
    host.fixed_rate_override != null && `${fmtTHB(host.fixed_rate_override)}/mo`,
  ].filter(Boolean) as string[];

  return (
    <div>
      <Link
        href="/admin/hosts"
        className="mb-3 inline-flex items-center gap-1.5 rounded text-sm text-earth-600 hover:text-brand focus:outline-none focus-visible:ring-2 focus-visible:ring-brand/40"
      >
        <ArrowLeft className="h-4 w-4" />
        Hosts
      </Link>
      <PageHeader eyebrow="Host" title={host.name} />

      <Card className="border-earth-100 bg-white">
        <CardContent className="grid gap-5 p-5 sm:grid-cols-2 lg:grid-cols-4">
          <div className="min-w-0">
            <p className="mb-1.5 text-xs text-earth-500">Status</p>
            <div className="flex flex-wrap gap-1.5">
              <StatusBadge status={host.status} />
              {host.is_verified && <StatusBadge status="verified" tone="brand" label="Verified" />}
              {blocked && <StatusBadge status="blocked" tone="destructive" label="Bookings blocked" />}
            </div>
          </div>
          <div className="min-w-0">
            <p className="mb-1.5 text-xs text-earth-500">Plan</p>
            <p className="font-medium text-earth-900">{PLAN_LABELS[host.plan_type] ?? host.plan_type}</p>
            {planNote && <p className="text-xs text-earth-600">{planNote}</p>}
            {overrides.length > 0 && <p className="text-xs text-earth-600">Overrides: {overrides.join(", ")}</p>}
          </div>
          <div className="min-w-0">
            <p className="mb-1.5 text-xs text-earth-500">Wallet</p>
            <p className={`font-medium tabular-nums ${(host.wallet_balance ?? 0) < 0 ? "text-red-700" : "text-earth-900"}`}>
              {(host.wallet_balance ?? 0) < 0 ? "−" : ""}
              {fmtTHB(Math.abs(host.wallet_balance ?? 0))}
            </p>
            {host.wallet_negative_since && (
              <p className="text-xs text-earth-600">Negative since {fmtBangkokTime(host.wallet_negative_since)}</p>
            )}
          </div>
          <div className="min-w-0 space-y-1 text-sm text-earth-800">
            <p className="mb-1.5 text-xs text-earth-500">Contact</p>
            <p className="flex items-center gap-1.5 break-all">
              <Mail className="h-3.5 w-3.5 shrink-0 text-earth-400" />
              {host.email}
            </p>
            {host.phone && (
              <p className="flex items-center gap-1.5">
                <Phone className="h-3.5 w-3.5 shrink-0 text-earth-400" />
                {host.phone}
              </p>
            )}
            <p className="text-xs text-earth-500">Joined {fmtBangkokTime(host.created_at)}</p>
          </div>
        </CardContent>
      </Card>

      <Section title="Homestays">
        {homestays.length === 0 ? (
          <Empty>No homestay yet.</Empty>
        ) : (
          <ul className="divide-y divide-earth-100">
            {homestays.map((h) => (
              <li key={h.id} className="flex items-center justify-between gap-3 px-4 py-3 text-sm">
                <span className="flex min-w-0 items-center gap-2">
                  <span className="truncate font-medium text-earth-900">{h.name}</span>
                  <StatusBadge status={h.is_active ? "active" : "inactive"} />
                </span>
                <a
                  href={`/${h.slug}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex shrink-0 items-center gap-1 rounded text-earth-600 hover:text-brand focus:outline-none focus-visible:ring-2 focus-visible:ring-brand/40"
                >
                  /{h.slug}
                  <ExternalLink className="h-3.5 w-3.5" aria-hidden />
                  <span className="sr-only">(opens in a new tab)</span>
                </a>
              </li>
            ))}
          </ul>
        )}
      </Section>

      {/* Money before the wide text, so a phone sees it without scrolling sideways. */}
      <Section title="Wallet ledger" note={`Latest ${DETAIL_LIMITS.wallet}`}>
        {wallet.length === 0 ? (
          <Empty>No wallet activity.</Empty>
        ) : (
          <Table head={["Date", "Type", "Amount", "Balance", "Description", "By"]} numeric={["Amount", "Balance"]}>
            {wallet.map((t) => (
              <tr key={t.id}>
                <td className={`${td} whitespace-nowrap tabular-nums`}>{fmtBangkokTime(t.created_at)}</td>
                <td className={td}>
                  {t.type}
                  {t.status !== "verified" && <StatusBadge status={t.status} className="ml-1.5" />}
                </td>
                <td className={`${tdNum} ${t.amount < 0 ? "text-red-700" : ""}`}>{signedTHB(t.amount)}</td>
                <td className={tdNum}>{fmtTHB(t.balance_after)}</td>
                <td className={`${td} min-w-56 text-earth-600`}>{t.description ?? "—"}</td>
                <td className={`${td} text-earth-600`}>{t.created_by}</td>
              </tr>
            ))}
          </Table>
        )}
      </Section>

      <Section title="Invoices" note={`Latest ${DETAIL_LIMITS.invoices}`}>
        {invoices.length === 0 ? (
          <Empty>No invoices.</Empty>
        ) : (
          <Table head={["Period", "Term", "Due", "Status", "Amount"]} numeric={["Amount"]}>
            {invoices.map((inv) => (
              <tr key={inv.id}>
                <td className={`${td} whitespace-nowrap`}>
                  {day(inv.period_start)} → {day(inv.period_end)}
                </td>
                <td className={td}>{inv.term_months} mo</td>
                <td className={`${td} whitespace-nowrap`}>{day(inv.due_date)}</td>
                <td className={td}>
                  <StatusBadge status={inv.status} />
                  {inv.paid_at && <span className="ml-1.5 text-xs text-earth-500">{fmtBangkokTime(inv.paid_at)}</span>}
                </td>
                <td className={tdNum}>{fmtTHB(inv.amount)}</td>
              </tr>
            ))}
          </Table>
        )}
      </Section>

      <Section title="Recent bookings" note={`Latest ${DETAIL_LIMITS.bookings}`}>
        {bookings.length === 0 ? (
          <Empty>No bookings.</Empty>
        ) : (
          <Table head={["Guest", "Stay", "Source", "Status", "Total"]} numeric={["Total"]}>
            {bookings.map((b) => (
              <tr key={b.id}>
                <td className={td}>{b.guest_name}</td>
                <td className={`${td} whitespace-nowrap`}>
                  {day(b.check_in)} → {day(b.check_out)}
                </td>
                <td className={`${td} text-earth-600`}>{b.booking_source}</td>
                <td className={td}>
                  <StatusBadge status={b.status} />
                </td>
                <td className={tdNum}>{fmtTHB(b.total_price)}</td>
              </tr>
            ))}
          </Table>
        )}
      </Section>

      <Section title="Staff logins">
        {staff.length === 0 ? (
          <Empty>No staff logins.</Empty>
        ) : (
          <ul className="divide-y divide-earth-100">
            {staff.map((s) => (
              <li key={s.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-sm">
                <span className="font-medium text-earth-900">{s.name}</span>
                <span className="break-all text-earth-600">{s.email}</span>
                <span className="text-xs text-earth-500">Added {fmtBangkokTime(s.created_at)}</span>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section title="Activity" note={`Latest ${DETAIL_LIMITS.logs}`}>
        {logs.length === 0 ? (
          <Empty>No recorded activity.</Empty>
        ) : (
          <ul className="divide-y divide-earth-100">
            {logs.map((l) => (
              <li key={l.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 text-sm">
                <span className="flex items-center gap-2">
                  <span className="font-mono text-xs text-earth-800">{l.event_type}</span>
                  <StatusBadge status={l.actor_type} />
                </span>
                <span className="text-xs tabular-nums text-earth-500">{fmtBangkokTime(l.created_at)}</span>
              </li>
            ))}
          </ul>
        )}
      </Section>
    </div>
  );
}
