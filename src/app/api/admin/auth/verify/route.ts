import { NextResponse } from "next/server";
import {
  createServerSupabaseClient,
  createServiceRoleClient,
} from "@/lib/supabase/server";

export async function POST() {
  try {
    const supabase = await createServerSupabaseClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    const serviceClient = createServiceRoleClient();
    const { data: admin } = await serviceClient
      .from("platform_admins")
      .select("id, name, email")
      .eq("user_id", user.id)
      .single();

    if (!admin) {
      return NextResponse.json(
        { error: "Not a platform admin" },
        { status: 403 }
      );
    }

    return NextResponse.json({ admin });
  } catch (error) {
    console.error("[Admin Auth] verify error:", error);
    return NextResponse.json(
      { error: "Something went wrong" },
      { status: 500 }
    );
  }
}
