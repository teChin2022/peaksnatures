import { createRateLimiter } from "@/lib/rate-limit";

/**
 * PIN tries per host, shared by every route that checks the security PIN
 * (reveal-sensitive, update-sensitive, security-pin PUT). A 4-digit PIN has
 * 10,000 values; at 5 tries per 15 minutes guessing it takes weeks, while a
 * host who mistypes still gets in. Keyed by user id, not IP: the attacker this
 * stops already holds the host's session (audit F-13).
 */
export const pinAttemptLimit = createRateLimiter({
  limit: 5,
  windowMs: 15 * 60_000,
  name: "security-pin",
});

export const pinAttemptKey = (userId: string) => `pin:${userId}`;
