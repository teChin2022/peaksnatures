import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createServerSupabaseClient, createServiceRoleClient } from "@/lib/supabase/server";
import { createRateLimiter } from "@/lib/rate-limit";

/** Staff logins per host, so one host cannot create auth users without end. */
export const MAX_STAFF_PER_HOST = 10;

/**
 * Owner-password checks per owner for staff changes. Every call counts: the
 * caller already holds the owner's session, and this is what keeps it from
 * guessing the password.
 */
const ownerPasswordLimit = createRateLimiter({
  limit: 10,
  windowMs: 15 * 60_000,
  name: "staff-owner-password",
});

export interface StaffOwner {
  userId: string;
  email: string;
  host: { id: string; name: string };
  sc: ReturnType<typeof createServiceRoleClient>;
}

/**
 * The signed-in owner and their host, or the response to send. Owner-only by
 * construction: a staff login has no hosts row and gets 404.
 */
export async function getStaffOwner(): Promise<StaffOwner | NextResponse> {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const sc = createServiceRoleClient();
  const { data: host } = await sc.from("hosts").select("id, name").eq("user_id", user.id).maybeSingle();
  if (!host) {
    return NextResponse.json({ error: "Host not found" }, { status: 404 });
  }

  return { userId: user.id, email: user.email, host: host as { id: string; name: string }, sc };
}

/**
 * Re-checks the owner's current password before a staff login is added, reset
 * or removed. Not the security PIN: a first PIN can be set with nothing but a
 * session, so a stolen session could set one and then add a lasting login.
 * Returns the response to send when the check fails, else null.
 */
export async function checkOwnerPassword(owner: StaffOwner, password: string): Promise<NextResponse | null> {
  const limited = await ownerPasswordLimit.checkKey(`staff-owner:${owner.userId}`);
  if (limited) return limited;

  const verifier = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
  const { error } = await verifier.auth.signInWithPassword({ email: owner.email, password });
  if (error) {
    return NextResponse.json({ error: "WRONG_PASSWORD" }, { status: 403 });
  }
  // End only this throwaway session: signOut() defaults to the global scope,
  // which would sign the owner out of every device.
  verifier.auth.signOut({ scope: "local" }).catch(() => {});
  return null;
}
