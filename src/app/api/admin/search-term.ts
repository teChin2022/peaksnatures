/**
 * Admin list search. The routes run as the service role, so the text the admin
 * types never reaches PostgREST's filter syntax as-is: only letters (Thai
 * included, with their marks), digits, spaces and @ . + - _ survive, and the
 * value is double-quoted inside the `or` filter so a dot or comma in an email
 * cannot end the condition.
 */
const MAX_LENGTH = 100;

/** The cleaned term, or null when too little is left to search on. */
export function adminSearchTerm(raw: string | null): string | null {
  if (!raw) return null;
  const cleaned = raw
    .normalize("NFC")
    .replace(/[^\p{L}\p{M}\p{N} @.+\-_]/gu, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, MAX_LENGTH);
  return cleaned.length >= 2 ? cleaned : null;
}

/** `col.ilike."%term%"` for each column, joined for `.or()`. Pass only adminSearchTerm output. */
export function ilikeAny(columns: string[], term: string): string {
  return columns.map((c) => `${c}.ilike."%${term}%"`).join(",");
}
