import type { createServiceRoleClient } from "@/lib/supabase/server";

type ServiceClient = ReturnType<typeof createServiceRoleClient>;

export type HostRole = "owner" | "staff";

/**
 * The host a signed-in user works for: the one they own, else the one they are
 * staff of (migration 081). Only routes staff may use call this; owner-only
 * routes keep `hosts.eq("user_id", user.id)`, which a staff login never matches.
 */
export async function getHostAccess(
  sc: ServiceClient,
  userId: string,
): Promise<{ hostId: string; role: HostRole } | null> {
  const { data: owned } = await sc.from("hosts").select("id").eq("user_id", userId).maybeSingle();
  if (owned) return { hostId: (owned as { id: string }).id, role: "owner" };

  const { data: staff } = await sc.from("host_staff").select("host_id").eq("user_id", userId).maybeSingle();
  if (staff) return { hostId: (staff as { host_id: string }).host_id, role: "staff" };

  return null;
}

/** True when userId owns this host or is one of its staff. */
export async function canActForHost(
  sc: ServiceClient,
  userId: string,
  host: { id: string; user_id: string },
): Promise<boolean> {
  if (host.user_id === userId) return true;
  const { data } = await sc
    .from("host_staff")
    .select("id")
    .eq("host_id", host.id)
    .eq("user_id", userId)
    .maybeSingle();
  return !!data;
}

/**
 * Deletes every staff login of a host. Call it before deleting the host: the
 * cascade drops the host_staff rows but would leave the auth users behind.
 */
export async function deleteStaffLogins(sc: ServiceClient, hostId: string): Promise<void> {
  const { data } = await sc.from("host_staff").select("user_id").eq("host_id", hostId);
  for (const row of (data as { user_id: string }[] | null) ?? []) {
    const { error } = await sc.auth.admin.deleteUser(row.user_id);
    if (error) console.error("[host-access] Failed to delete staff login:", row.user_id, error.message);
  }
}
