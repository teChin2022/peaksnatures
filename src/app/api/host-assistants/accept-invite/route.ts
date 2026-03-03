import { NextRequest, NextResponse } from "next/server";
import { createHash, timingSafeEqual } from "crypto";
import { createServiceRoleClient } from "@/lib/supabase/server";

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

// Simple in-memory rate limiter (per-process; resets on deploy)
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT_MAX = 5;
const RATE_LIMIT_WINDOW_MS = 60_000; // 1 minute

function isRateLimited(ip: string): boolean {
  const now = Date.now();
  const entry = rateLimitMap.get(ip);
  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(ip, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return false;
  }
  entry.count++;
  return entry.count > RATE_LIMIT_MAX;
}

// GET /api/host-assistants/accept-invite?token=<raw_token>
export async function GET(req: NextRequest) {
  const { origin } = new URL(req.url);
  const errorRedirect = `${origin}/login?error=invite_invalid`;

  try {
    // Rate limit by IP
    const ip =
      req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      req.headers.get("x-real-ip") ||
      "unknown";
    if (isRateLimited(ip)) {
      return NextResponse.redirect(`${origin}/login?error=rate_limited`);
    }

    const rawToken = req.nextUrl.searchParams.get("token");
    if (!rawToken || rawToken.length < 32) {
      return NextResponse.redirect(errorRedirect);
    }

    const incomingHash = hashToken(rawToken);
    const serviceClient = createServiceRoleClient();

    // Look up the invitation by token hash
    const { data: invite, error: lookupError } = await serviceClient
      .from("host_assistants")
      .select("id, email, user_id, status, invite_token_hash, invite_expires_at")
      .eq("invite_token_hash", incomingHash)
      .eq("status", "pending")
      .single();

    if (lookupError || !invite) {
      console.error("[Accept Invite] Token not found or not pending");
      return NextResponse.redirect(errorRedirect);
    }

    const inv = invite as {
      id: string;
      email: string;
      user_id: string | null;
      status: string;
      invite_token_hash: string;
      invite_expires_at: string | null;
    };

    // Constant-time comparison of the token hash
    const storedBuf = Buffer.from(inv.invite_token_hash, "hex");
    const incomingBuf = Buffer.from(incomingHash, "hex");
    if (
      storedBuf.length !== incomingBuf.length ||
      !timingSafeEqual(storedBuf, incomingBuf)
    ) {
      return NextResponse.redirect(errorRedirect);
    }

    // Check expiry
    if (inv.invite_expires_at && new Date(inv.invite_expires_at) < new Date()) {
      console.error("[Accept Invite] Token expired");
      return NextResponse.redirect(`${origin}/login?error=invite_expired`);
    }

    // Ensure assistant has a Supabase account
    const { error: createUserError } =
      await serviceClient.auth.admin.createUser({
        email: inv.email,
        email_confirm: true,
      });

    // Ignore "already registered" errors
    if (
      createUserError &&
      !createUserError.message?.toLowerCase().includes("already")
    ) {
      console.error("[Accept Invite] Create user error:", createUserError);
      return NextResponse.redirect(errorRedirect);
    }

    // Generate a fresh magic link for the assistant to sign in
    const { data: linkData, error: linkError } =
      await serviceClient.auth.admin.generateLink({
        type: "magiclink",
        email: inv.email,
      });

    if (linkError || !linkData) {
      console.error("[Accept Invite] Generate magic link error:", linkError);
      return NextResponse.redirect(errorRedirect);
    }

    // Invalidate the invite token (single-use) and activate the invitation
    const assistantUserId = linkData.user.id;
    await serviceClient
      .from("host_assistants")
      .update({
        user_id: assistantUserId,
        status: "active",
        accepted_at: new Date().toISOString(),
        invite_token_hash: null,
      } as never)
      .eq("id", inv.id);

    console.log(
      `[Accept Invite] Activated invitation ${inv.id} for ${inv.email}`
    );

    // Redirect through auth callback with the fresh magic link token
    const hashedToken = linkData.properties.hashed_token;
    const callbackUrl = `${origin}/api/auth/callback?token_hash=${hashedToken}&type=magiclink&next=/dashboard`;

    return NextResponse.redirect(callbackUrl);
  } catch (error) {
    console.error("[Accept Invite] Unexpected error:", error);
    return NextResponse.redirect(errorRedirect);
  }
}
