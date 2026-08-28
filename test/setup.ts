// Several modules read local-time date parts (calculate-price's formatDateStr,
// get-deposit's getMonth, billing's date math). Without a pinned zone, a night
// key silently shifts by a day depending on where the suite runs.
process.env.TZ = "Asia/Bangkok";

// cron-auth.ts throws AT MODULE LOAD when CRON_SECRET is missing or under 32
// chars, so anything transitively importing it fails to import without this.
process.env.CRON_SECRET = "test-cron-secret-at-least-32-chars-long";

process.env.NEXT_PUBLIC_SUPABASE_URL = "http://localhost:54321";
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "test-anon-key";
process.env.SUPABASE_SERVICE_ROLE_KEY = "test-service-role-key";
process.env.NEXT_PUBLIC_APP_URL = "http://localhost:3000";

// REDIS_URL is deliberately left unset so rate-limit.ts uses its in-memory path.
