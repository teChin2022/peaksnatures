import { NextRequest, NextResponse } from "next/server";
import { createHash, timingSafeEqual } from "node:crypto";

const CRON_SECRET = process.env.CRON_SECRET;

if (!CRON_SECRET) {
  throw new Error(
    "[cron-auth] CRON_SECRET is not set. Generate one with `openssl rand -base64 32` and set it in the environment.",
  );
}

if (CRON_SECRET.length < 32) {
  throw new Error(
    "[cron-auth] CRON_SECRET must be at least 32 characters. Generate a strong secret with `openssl rand -base64 32`.",
  );
}

// Hash both sides before timingSafeEqual: it requires equal-length buffers,
// and hashing first avoids leaking the secret length via the comparison path.
const EXPECTED_HEADER_DIGEST = createHash("sha256")
  .update(`Bearer ${CRON_SECRET}`)
  .digest();

export function assertCronAuthorized(req: NextRequest): NextResponse | null {
  const header = req.headers.get("authorization");
  if (!header) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const providedDigest = createHash("sha256").update(header).digest();

  if (
    providedDigest.length !== EXPECTED_HEADER_DIGEST.length ||
    !timingSafeEqual(providedDigest, EXPECTED_HEADER_DIGEST)
  ) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  return null;
}
