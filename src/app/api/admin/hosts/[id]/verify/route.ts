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

    // Fetch admin name for audit trail
    const { data: adminRow } = await sc
      .from("platform_admins")
      .select("name")
      .eq("user_id", user.id)
      .single();
    const adminName = (adminRow as { name: string } | null)?.name || user.id;

    // Get host current state
    const { data: host, error: fetchError } = await sc
      .from("hosts")
      .select("id, name, is_verified")
      .eq("id", id)
      .single();

    if (fetchError || !host) {
      return NextResponse.json({ error: "Host not found" }, { status: 404 });
    }

    const hostRow = host as { id: string; name: string; is_verified: boolean };
    const newValue = !hostRow.is_verified;

    // Toggle is_verified
    const { error: updateError } = await sc
      .from("hosts")
      .update({ is_verified: newValue, updated_by: adminName } as never)
      .eq("id", id);

    if (updateError) {
      console.error("[Admin Verify] update error:", updateError);
      return NextResponse.json({ error: "Failed to update verification" }, { status: 500 });
    }

    return NextResponse.json({ id, is_verified: newValue });
  } catch (error) {
    console.error("[Admin Verify] error:", error);
    return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
  }
}
