/**
 * Cloudflare Turnstile server-side token verification.
 *
 * Returns "pass" | "fail" | "skip":
 * - "pass" → Cloudflare confirmed the token is valid.
 * - "fail" → Cloudflare confirmed the token is invalid. Caller should return 403.
 * - "skip" → Verification was not possible (no token, no secret configured, Cloudflare
 *            unreachable, or timeout). Caller should treat this as allowed — this is
 *            the fail-open contract that keeps real users from being blocked when
 *            our CAPTCHA infrastructure is unavailable.
 *
 * Do not change this contract without auditing all call sites — bookings, contact,
 * auth, and reviews lookup all depend on it.
 */
export async function verifyTurnstileToken(
  token: string
): Promise<"pass" | "fail" | "skip"> {
  if (!token) {
    console.warn(
      "Turnstile: No token provided — widget may have failed to load. Allowing request."
    );
    return "skip";
  }
  const secret = process.env.TURNSTILE_SECRET_KEY;
  if (!secret) {
    console.error("TURNSTILE_SECRET_KEY is not configured — skipping verification");
    return "skip";
  }
  try {
    const response = await fetch(
      "https://challenges.cloudflare.com/turnstile/v0/siteverify",
      {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ secret, response: token }),
        signal: AbortSignal.timeout(5000),
      }
    );
    const data = await response.json();
    return data.success === true ? "pass" : "fail";
  } catch (err) {
    console.error(
      "Turnstile: Cloudflare verification unreachable — allowing request.",
      err
    );
    return "skip";
  }
}
