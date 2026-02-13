import { NextResponse } from "next/server";

// Registration is now handled client-side via supabase.auth.signUp()
// Host record creation happens in /api/auth/callback after email verification
export async function POST() {
  return NextResponse.json(
    { error: "Registration is handled client-side. Use the /register page." },
    { status: 410 }
  );
}
