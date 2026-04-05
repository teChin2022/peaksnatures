import { NextRequest, NextResponse, after } from "next/server";
import {
  createServerSupabaseClient,
  createServiceRoleClient,
} from "@/lib/supabase/server";
import { isAdmin } from "@/lib/admin";
import { logEvent, EventType } from "@/lib/history-log";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createServerSupabaseClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user || !(await isAdmin(user.id))) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    const body = await req.json();
    const { status } = body;

    if (!status || !["pending", "paid", "overdue"].includes(status)) {
      return NextResponse.json({ error: "Invalid status" }, { status: 400 });
    }

    const sc = createServiceRoleClient();

    // Fetch admin name
    const { data: adminRow } = await sc
      .from("platform_admins")
      .select("name")
      .eq("user_id", user.id)
      .single();
    const adminName = (adminRow as { name: string } | null)?.name || user.id;

    const updateData: Record<string, unknown> = {
      status,
      updated_by: adminName,
    };

    if (status === "paid") {
      updateData.paid_at = new Date().toISOString();
    }

    const { data: invoice, error: updateError } = await sc
      .from("invoices")
      .update(updateData as never)
      .eq("id", id)
      .select("id, host_id, amount, status")
      .single();

    if (updateError) {
      console.error("[Admin InvoiceStatus] update error:", updateError);
      return NextResponse.json({ error: "Failed to update invoice" }, { status: 500 });
    }

    const eventType = status === "paid" ? EventType.INVOICE_PAID : EventType.INVOICE_OVERDUE;

    after(async () => {
      await logEvent({
        entityType: "billing",
        entityId: id,
        eventType,
        actorType: "admin",
        actorId: user.id,
        data: {
          invoice_id: id,
          host_id: (invoice as { host_id: string }).host_id,
          status,
          marked_by: adminName,
        },
        req,
      });
    });

    return NextResponse.json({ success: true, invoice });
  } catch {
    return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
  }
}
