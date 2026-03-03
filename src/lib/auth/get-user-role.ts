import { createClient } from "@/lib/supabase/client";

export type UserRole = {
  role: "owner" | "assistant";
  hostId: string;
};

/**
 * Determine if the current user is a host owner or an assistant.
 * Returns null if the user is neither (not authenticated or no host link).
 */
export async function getUserRole(): Promise<UserRole | null> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  // Check if user is an active assistant first (takes priority over stale host records)
  try {
    const { data: assistant } = await supabase
      .from("host_assistants")
      .select("host_id")
      .eq("user_id", user.id)
      .eq("status", "active")
      .limit(1)
      .maybeSingle();

    if (assistant) {
      return { role: "assistant", hostId: (assistant as { host_id: string }).host_id };
    }
  } catch {
    // Table may not exist yet or RLS error — treat as no assistant
  }

  // Check if user is a host owner
  const { data: host } = await supabase
    .from("hosts")
    .select("id")
    .eq("user_id", user.id)
    .maybeSingle();

  if (host) {
    return { role: "owner", hostId: (host as { id: string }).id };
  }

  return null;
}
