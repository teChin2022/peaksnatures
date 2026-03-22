import { createServiceRoleClient } from "@/lib/supabase/server";

/**
 * Short-lived in-memory cache for admin status.
 * TTL: 60 seconds. Avoids repeated DB lookups on every admin API request.
 */
const adminCache = new Map<string, { value: boolean; expires: number }>();
const ADMIN_CACHE_TTL_MS = 60_000; // 60 seconds

/**
 * Check if a user_id belongs to a platform admin.
 * Uses the service-role client to bypass RLS.
 * Results are cached in-memory for 60s per server instance.
 */
export async function isAdmin(userId: string): Promise<boolean> {
  const cached = adminCache.get(userId);
  if (cached && cached.expires > Date.now()) {
    return cached.value;
  }

  const supabase = createServiceRoleClient();
  const { data } = await supabase
    .from("platform_admins")
    .select("id")
    .eq("user_id", userId)
    .single();
  const result = !!data;

  adminCache.set(userId, { value: result, expires: Date.now() + ADMIN_CACHE_TTL_MS });
  return result;
}
