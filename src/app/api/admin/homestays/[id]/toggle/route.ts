import { NextRequest, NextResponse } from "next/server";
import {
  createServerSupabaseClient,
  createServiceRoleClient,
} from "@/lib/supabase/server";
import { isAdmin } from "@/lib/admin";

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
    const sc = createServiceRoleClient();

    // Get current status
    const { data: homestay, error: fetchError } = await sc
      .from("homestays")
      .select("id, is_active")
      .eq("id", id)
      .single();

    if (fetchError || !homestay) {
      return NextResponse.json({ error: "Homestay not found" }, { status: 404 });
    }

    const current = homestay as { id: string; is_active: boolean };
    const newStatus = !current.is_active;

    const { error: updateError } = await sc
      .from("homestays")
      .update({ is_active: newStatus, updated_by: user.id } as never)
      .eq("id", id);

    if (updateError) {
      console.error("[Admin Toggle] update error:", updateError);
      return NextResponse.json({ error: "Failed to update" }, { status: 500 });
    }

    return NextResponse.json({ id, is_active: newStatus });
  } catch (error) {
    console.error("[Admin Toggle] error:", error);
    return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
  }
}
