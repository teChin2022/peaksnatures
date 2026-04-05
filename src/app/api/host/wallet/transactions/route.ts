import { NextRequest, NextResponse } from "next/server";
import {
  createServerSupabaseClient,
  createServiceRoleClient,
} from "@/lib/supabase/server";

export async function GET(req: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const sc = createServiceRoleClient();

    const { data: host } = await sc
      .from("hosts")
      .select("id")
      .eq("user_id", user.id)
      .single();

    if (!host) {
      return NextResponse.json({ error: "Host not found" }, { status: 404 });
    }

    const url = new URL(req.url);
    const page = Math.max(1, parseInt(url.searchParams.get("page") || "1"));
    const limit = Math.min(50, Math.max(1, parseInt(url.searchParams.get("limit") || "20")));
    const offset = (page - 1) * limit;

    const { count: total } = await sc
      .from("wallet_transactions")
      .select("id", { count: "exact", head: true })
      .eq("host_id", (host as { id: string }).id);

    const { data: transactions, error } = await sc
      .from("wallet_transactions")
      .select("*")
      .eq("host_id", (host as { id: string }).id)
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) {
      return NextResponse.json({ error: "Failed to fetch transactions" }, { status: 500 });
    }

    return NextResponse.json({
      transactions: transactions || [],
      total: total || 0,
      page,
      limit,
    });
  } catch {
    return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
  }
}
