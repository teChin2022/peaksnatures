import { NextRequest, NextResponse } from "next/server";
import { billingTodayStr } from "@/lib/billing-dates";
import { MONTH_RE, PLATFORM_FEE_TX_TYPES, REVENUE_STATUSES, monthBounds, summarizeMonth } from "@/lib/host-finance";
import { ownerHost, parseExpense } from "./shared";

const NO_STORE = { "Cache-Control": "private, no-store" };

/**
 * GET /api/host/expenses?month=YYYY-MM — the month's profit summary (booking
 * income − platform charges − recorded expenses) and its expense rows. The
 * month defaults to this Bangkok month.
 */
export async function GET(req: NextRequest) {
  try {
    const month = req.nextUrl.searchParams.get("month") ?? billingTodayStr().slice(0, 7);
    if (!MONTH_RE.test(month)) {
      return NextResponse.json({ error: "Invalid month" }, { status: 400 });
    }

    const owner = await ownerHost();
    if (owner instanceof NextResponse) return owner;
    const { sc, hostId } = owner;
    const { from, to, fromTs, toTs } = monthBounds(month);

    const homestays = await sc.from("homestays").select("id").eq("host_id", hostId);
    const homestayIds = ((homestays.data as { id: string }[] | null) ?? []).map((h) => h.id);

    const [bookings, wallet, invoices, expenses] = await Promise.all([
      homestayIds.length === 0
        ? { data: [], error: null }
        : sc
            .from("bookings")
            .select("total_price")
            .in("homestay_id", homestayIds)
            .in("status", [...REVENUE_STATUSES])
            .gte("check_in", from)
            .lt("check_in", to),
      sc
        .from("wallet_transactions")
        .select("amount")
        .eq("host_id", hostId)
        .in("type", [...PLATFORM_FEE_TX_TYPES])
        .gte("created_at", fromTs)
        .lt("created_at", toTs),
      sc
        .from("invoices")
        .select("amount")
        .eq("host_id", hostId)
        .eq("status", "paid")
        .gte("paid_at", fromTs)
        .lt("paid_at", toTs),
      sc
        .from("host_expenses")
        .select("id, spent_on, category, amount, note")
        .eq("host_id", hostId)
        .gte("spent_on", from)
        .lt("spent_on", to)
        .order("spent_on", { ascending: false })
        .order("created_at", { ascending: false }),
    ]);

    const failed = [homestays, bookings, wallet, invoices, expenses].find((r) => r.error);
    if (failed) {
      console.error("[HostExpenses] Query failed:", failed.error);
      return NextResponse.json({ error: "Failed to load" }, { status: 500 });
    }

    const rows = (expenses.data as { id: string; spent_on: string; category: string; amount: number; note: string | null }[] | null) ?? [];
    const summary = summarizeMonth({
      bookings: (bookings.data as { total_price: number }[] | null) ?? [],
      walletRows: (wallet.data as { amount: number }[] | null) ?? [],
      invoices: (invoices.data as { amount: number }[] | null) ?? [],
      expenses: rows,
    });

    return NextResponse.json(
      { month, ...summary, expenses: rows.map((r) => ({ ...r, amount: Number(r.amount) })) },
      { headers: NO_STORE },
    );
  } catch (error) {
    console.error("[HostExpenses] Error:", error);
    return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
  }
}

/** POST /api/host/expenses — record one expense for the signed-in owner. */
export async function POST(req: NextRequest) {
  try {
    const expense = parseExpense(await req.json().catch(() => null));
    if (!expense) {
      return NextResponse.json({ error: "Invalid request" }, { status: 400 });
    }

    const owner = await ownerHost();
    if (owner instanceof NextResponse) return owner;
    const { sc, hostId } = owner;

    const { data, error } = await sc
      .from("host_expenses")
      .insert({ host_id: hostId, ...expense } as never)
      .select("id")
      .single();
    if (error || !data) {
      console.error("[HostExpenses] Insert failed:", error);
      return NextResponse.json({ error: "Failed to save" }, { status: 500 });
    }

    return NextResponse.json({ id: (data as { id: string }).id }, { status: 201 });
  } catch (error) {
    console.error("[HostExpenses] Error:", error);
    return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
  }
}
