import { createServiceRoleClient } from "@/lib/supabase/server";

/**
 * Check if a user_id belongs to a platform admin.
 * Uses the service-role client to bypass RLS.
 */
export async function isAdmin(userId: string): Promise<boolean> {
  const supabase = createServiceRoleClient();
  const { data } = await supabase
    .from("platform_admins")
    .select("id")
    .eq("user_id", userId)
    .single();
  return !!data;
}
