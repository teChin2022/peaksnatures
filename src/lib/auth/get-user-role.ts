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

  // Check if user is a host owner
  const { data: host } = await supabase
    .from("hosts")
    .select("id")
    .eq("user_id", user.id)
    .single();

  if (host) {
    return { role: "owner", hostId: (host as { id: string }).id };
  }

  // Check if user is an active assistant
  const { data: assistant } = await supabase
    .from("host_assistants")
    .select("host_id")
    .eq("user_id", user.id)
    .eq("status", "active")
    .single();

  if (assistant) {
    return { role: "assistant", hostId: (assistant as { host_id: string }).host_id };
  }

  return null;
}
