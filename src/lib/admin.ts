import { createServiceRoleClient } from "@/lib/supabase/server";

/**
 * Check if a user_id belongs to a platform admin.
 * Uses the service-role client to bypass RLS.
 *
 * Not cached: a 60-second in-memory cache used to let a removed admin keep
 * their access for up to a minute per server instance (audit L-03). Admin
 * traffic is light, so one query per check costs little.
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
