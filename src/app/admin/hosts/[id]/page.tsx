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
import { TABLE, TABLE_CARD, TABLE_WRAP, TBODY, TD, TD_LEAD, TD_TRAIL, TH, TH_ROW, TR } from "@/components/admin/table-classes";
import { cn } from "@/lib/utils";
import { eventLabel } from "@/lib/history-event-types";
import { DETAIL_LIMITS, getAdminHostDetail } from "./data";

const PLAN_LABELS: Record<string, string> = { free: "Free", commission: "Commission", fixed_rate: "Fixed Rate" };
const day = (d: string) => fmtDateStr(d, "MMM d, yyyy", "en");
const signedTHB = (n: number) => `${n < 0 ? "−" : "+"}${fmtTHB(Math.abs(n))}`;

/** An empty section is one line (title, then what is missing), not a card holding one sentence. */
function Section({ title, note, empty, children }: { title: string; note?: string; empty?: string; children?: React.ReactNode }) {
  if (empty) {
    return (
      <section className="mt-6 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 border-b border-earth-100 pb-3">
        <h2 className="text-sm font-semibold text-earth-900">{title}</h2>
        <p className="text-sm text-earth-600">{empty}</p>
      </section>
    );
  }
  return (
    <section className="mt-6">
      <div className="mb-2 flex items-baseline justify-between gap-3">
        <h2 className="text-sm font-semibold text-earth-900">{title}</h2>
        {note && <p className="text-xs text-earth-600">{note}</p>}
      </div>
      <Card className={TABLE_CARD}>
        <CardContent className="p-0">{children}</CardContent>
      </Card>
    </section>
  );
}

/** Rows on phones, a table from md (owner, 2026-11-20): see table-classes.ts. */
function Table({ head, numeric, children }: { head: string[]; numeric: string[]; children: React.ReactNode }) {
  return (
    <div className={TABLE_WRAP}>
      <table className={TABLE}>
        <thead>
          <tr className={TH_ROW}>
            {head.map((h) => (
              <th key={h} scope="col" className={cn(TH, numeric.includes(h) && "text-right")}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className={TBODY}>{children}</tbody>
      </table>
    </div>
  );
}

const num = "text-right tabular-nums whitespace-nowrap";
/** Phones: a small named figure beside its pair under the row's first line. */
const part = "max-md:col-span-1 max-md:text-xs max-md:text-earth-600";
/** Activity rows shown before "Show all". */
const ACTIVITY_SHOWN = 10;

function activityRow(l: { id: string; event_type: string; actor_type: string; created_at: string }) {
  return (
    <li key={l.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 text-sm">
      <span className="flex items-center gap-2">
        <span className="text-earth-800">{eventLabel(l.event_type)}</span>
        <StatusBadge status={l.actor_type} />
      </span>
      <span className="text-xs tabular-nums text-earth-600">{fmtBangkokTime(l.created_at)}</span>
    </li>
  );
}

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
        className="mb-3 inline-flex min-h-11 items-center gap-1.5 rounded text-sm text-earth-600 hover:text-brand focus:outline-none focus-visible:ring-2 focus-visible:ring-brand md:min-h-0"
      >
        <ArrowLeft className="h-4 w-4" />
        Hosts
      </Link>
      <PageHeader title={host.name} />

      <Card className="border-earth-100 bg-white py-0">
        <CardContent className="grid gap-5 p-5 sm:grid-cols-2 lg:grid-cols-4">
          <div className="min-w-0">
            <p className="mb-1.5 text-xs text-earth-600">Status</p>
            <div className="flex flex-wrap gap-1.5">
              <StatusBadge status={host.status} />
              {host.is_verified && <StatusBadge status="verified" tone="brand" label="Verified" />}
              {blocked && <StatusBadge status="blocked" tone="destructive" label="Bookings blocked" />}
            </div>
          </div>
          <div className="min-w-0">
            <p className="mb-1.5 text-xs text-earth-600">Plan</p>
            <p className="font-medium text-earth-900">{PLAN_LABELS[host.plan_type] ?? host.plan_type}</p>
            {planNote && <p className="text-xs text-earth-600">{planNote}</p>}
            {overrides.length > 0 && <p className="text-xs text-earth-600">Overrides: {overrides.join(", ")}</p>}
          </div>
          <div className="min-w-0">
            <p className="mb-1.5 text-xs text-earth-600">Wallet</p>
            <p className={`font-medium tabular-nums ${(host.wallet_balance ?? 0) < 0 ? "text-red-700" : "text-earth-900"}`}>
              {(host.wallet_balance ?? 0) < 0 ? "−" : ""}
              {fmtTHB(Math.abs(host.wallet_balance ?? 0))}
            </p>
            {host.wallet_negative_since && (
              <p className="text-xs text-earth-600">Negative since {fmtBangkokTime(host.wallet_negative_since)}</p>
            )}
          </div>
          <div className="min-w-0 space-y-1 text-sm text-earth-800">
            <p className="mb-1.5 text-xs text-earth-600">Contact</p>
            {/* Tap to write or call. */}
            <a href={`mailto:${host.email}`} className="flex min-h-6 items-center gap-1.5 break-all underline-offset-4 hover:text-brand hover:underline">
              <Mail className="h-3.5 w-3.5 shrink-0 text-earth-400" />
              {host.email}
            </a>
            {host.phone && (
              <a href={`tel:${host.phone}`} className="flex min-h-6 w-fit items-center gap-1.5 tabular-nums underline-offset-4 hover:text-brand hover:underline">
                <Phone className="h-3.5 w-3.5 shrink-0 text-earth-400" />
                {host.phone}
              </a>
            )}
            <p className="text-xs text-earth-600">Joined {fmtBangkokTime(host.created_at)}</p>
          </div>
        </CardContent>
      </Card>

      <Section title="Homestays" empty={homestays.length === 0 ? "No homestay yet." : undefined}>
        {homestays.length > 0 && (
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
                  className="inline-flex shrink-0 items-center gap-1 rounded text-earth-600 hover:text-brand focus:outline-none focus-visible:ring-2 focus-visible:ring-brand max-md:min-h-11"
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
      <Section title="Wallet ledger" note={`Latest ${DETAIL_LIMITS.wallet}`} empty={wallet.length === 0 ? "No wallet activity." : undefined}>
        {wallet.length > 0 && (
          <Table head={["Date", "Type", "Amount", "Balance", "Description", "By"]} numeric={["Amount", "Balance"]}>
            {wallet.map((t) => (
              <tr key={t.id} className={TR}>
                <td className={cn(TD, "whitespace-nowrap tabular-nums max-md:order-2 max-md:text-xs max-md:text-earth-600")}>{fmtBangkokTime(t.created_at)}</td>
                <td className={cn(TD_LEAD, "max-md:font-medium max-md:text-earth-900")}>
                  {t.type}
                  {t.status !== "verified" && <StatusBadge status={t.status} className="ml-1.5" />}
                </td>
                <td className={cn(TD_TRAIL, num, t.amount < 0 && "text-red-700")}>{signedTHB(t.amount)}</td>
                <td className={cn(TD, num, "max-md:text-left max-md:text-xs max-md:text-earth-600 max-md:before:content-['Balance_']")}>{fmtTHB(t.balance_after)}</td>
                <td className={cn(TD, "text-earth-600 md:min-w-56")}>{t.description ?? "—"}</td>
                <td className={cn(TD, "text-earth-600 max-md:order-2 max-md:text-xs max-md:before:content-['by_']")}>{t.created_by}</td>
              </tr>
            ))}
          </Table>
        )}
      </Section>

      <Section title="Invoices" note={`Latest ${DETAIL_LIMITS.invoices}`} empty={invoices.length === 0 ? "No invoices." : undefined}>
        {invoices.length > 0 && (
          <Table head={["Period", "Term", "Due", "Status", "Amount"]} numeric={["Amount"]}>
            {invoices.map((inv) => (
              <tr key={inv.id} className={TR}>
                <td className={cn(TD_LEAD, "md:whitespace-nowrap")}>
                  {day(inv.period_start)} → {day(inv.period_end)}
                </td>
                <td className={cn(TD, part)}>{inv.term_months} mo</td>
                <td className={cn(TD, part, "whitespace-nowrap max-md:before:content-['Due_']")}>{day(inv.due_date)}</td>
                <td className={cn(TD, "max-md:mt-1")}>
                  <StatusBadge status={inv.status} />
                  {inv.paid_at && <span className="ml-1.5 text-xs text-earth-600">{fmtBangkokTime(inv.paid_at)}</span>}
                </td>
                <td className={cn(TD_TRAIL, num, "max-md:font-semibold max-md:text-earth-900")}>{fmtTHB(inv.amount)}</td>
              </tr>
            ))}
          </Table>
        )}
      </Section>

      <Section title="Recent bookings" note={`Latest ${DETAIL_LIMITS.bookings}`} empty={bookings.length === 0 ? "No bookings." : undefined}>
        {bookings.length > 0 && (
          <Table head={["Guest", "Stay", "Source", "Status", "Total"]} numeric={["Total"]}>
            {bookings.map((b) => (
              <tr key={b.id} className={TR}>
                <td className={cn(TD_LEAD, "max-md:font-medium max-md:text-earth-900")}>{b.guest_name}</td>
                <td className={cn(TD, "md:whitespace-nowrap")}>
                  {day(b.check_in)} → {day(b.check_out)}
                </td>
                <td className={cn(TD, part, "text-earth-600 max-md:self-center")}>{b.booking_source}</td>
                <td className={cn(TD, "max-md:col-span-1 max-md:mt-1")}>
                  <StatusBadge status={b.status} />
                </td>
                <td className={cn(TD_TRAIL, num)}>{fmtTHB(b.total_price)}</td>
              </tr>
            ))}
          </Table>
        )}
      </Section>

      <Section title="Staff logins" empty={staff.length === 0 ? "No staff logins." : undefined}>
        {staff.length > 0 && (
          <ul className="divide-y divide-earth-100">
            {staff.map((s) => (
              <li key={s.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-sm">
                <span className="font-medium text-earth-900">{s.name}</span>
                <span className="break-all text-earth-600">{s.email}</span>
                <span className="text-xs text-earth-600">Added {fmtBangkokTime(s.created_at)}</span>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section title="Activity" note={`Latest ${DETAIL_LIMITS.logs}`} empty={logs.length === 0 ? "No recorded activity." : undefined}>
        {logs.length > 0 && (
          <>
            <ul className="divide-y divide-earth-100">{logs.slice(0, ACTIVITY_SHOWN).map(activityRow)}</ul>
            {/* The newest few first; the rest one tap away (mostly logins and logouts). */}
            {logs.length > ACTIVITY_SHOWN && (
              <details className="group border-t border-earth-100">
                <summary className="flex min-h-11 cursor-pointer list-none items-center px-4 text-sm font-medium text-earth-800 hover:text-brand focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand group-open:border-b group-open:border-earth-100 [&::-webkit-details-marker]:hidden">
                  <span className="group-open:hidden">Show {logs.length - ACTIVITY_SHOWN} more</span>
                  <span className="hidden group-open:inline">Older activity</span>
                </summary>
                <ul className="divide-y divide-earth-100">{logs.slice(ACTIVITY_SHOWN).map(activityRow)}</ul>
              </details>
            )}
          </>
        )}
      </Section>
    </div>
  );
}
