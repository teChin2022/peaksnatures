import { NextResponse } from "next/server";
import { createServerSupabaseClient, createServiceRoleClient } from "@/lib/supabase/server";
import { isAdmin } from "@/lib/admin";
import { blockingInvoiceFilter } from "@/lib/billing-dates";
import { ATTENTION_WINDOW_DAYS } from "@/app/admin/attention";
import { countUnsettledRejected } from "@/app/admin/billing/rejected/data";
import { countStaleDateChanges } from "@/app/admin/bookings/date-changes/data";
import { countGuestAiRequested } from "@/app/admin/guest-ai/data";

/**
 * Counts for the admin sidebar: the work waiting behind Hosts, Guest AI,
 * Billing, Rejected payments and Date changes. Same predicates as the Overview's
 * "Needs attention", so a badge and its row never disagree.
 */
export async function GET() {
  try {
    const supabase = await createServerSupabaseClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError || !user || !(await isAdmin(user.id))) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const sc = createServiceRoleClient();
    const since = new Date(Date.now() - ATTENTION_WINDOW_DAYS * 86_400_000).toISOString();
    const [pendingHosts, overdueInvoices, unsettledPayments, staleDateChanges, guestAiRequests] = await Promise.all([
      sc.from("hosts").select("id", { count: "exact", head: true }).eq("status", "pending"),
      sc.from("invoices").select("id", { count: "exact", head: true }).or(blockingInvoiceFilter()),
      countUnsettledRejected(since),
      countStaleDateChanges(),
      countGuestAiRequested(),
    ]);

    return NextResponse.json(
      {
        pendingHosts: pendingHosts.count ?? 0,
        overdueInvoices: overdueInvoices.count ?? 0,
        unsettledPayments,
        staleDateChanges,
        guestAiRequests,
      },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    console.error("[Admin Nav Counts] error:", error);
    return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
  }
}
