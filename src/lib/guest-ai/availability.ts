import { createServiceRoleClient } from "@/lib/supabase/server";

/**
 * Whether /[slug]/book shows the guest AI assistant: the platform switch is on
 * and the host's assistant is approved and switched on. False on any error,
 * including before migrations 084 / 085 are applied. The route checks all of
 * this again (and the caps) on every question; this only decides the button.
 */
export async function isGuestAiAvailable(hostId: string): Promise<boolean> {
  try {
    const sc = createServiceRoleClient();
    const [{ data: platform }, { data: host }] = await Promise.all([
      sc.from("platform_guest_ai_config").select("enabled").maybeSingle(),
      sc.from("host_ai_settings").select("status, enabled").eq("host_id", hostId).maybeSingle(),
    ]);
    const p = platform as { enabled: boolean } | null;
    const h = host as { status: string; enabled: boolean } | null;
    return !!p?.enabled && h?.status === "approved" && !!h.enabled;
  } catch {
    return false;
  }
}
