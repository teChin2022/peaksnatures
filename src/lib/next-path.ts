// Import-free: the login pages (client components) and the middleware use it.

const BASE = "http://next-path.invalid";

/**
 * Where to send someone after login: the `next` path the middleware recorded,
 * only if it is a page inside `area`. Anything else (another site, a
 * protocol-relative //host, a backslash trick, a path that resolves outside
 * the area, the login page itself) falls back to the area's home.
 */
function nextPathWithin(area: string, raw: string | null | undefined, exclude?: string): string {
  if (!raw || !raw.startsWith(area) || raw.startsWith("//") || /[\\\s]/.test(raw)) return area;
  let url: URL;
  try {
    url = new URL(raw, BASE);
  } catch {
    return area;
  }
  const path = url.pathname;
  if (url.origin !== BASE || (path !== area && !path.startsWith(`${area}/`)) || path === exclude) return area;
  return path + url.search;
}

/** Admin login: back to an /admin page, never off-site. */
export const adminNextPath = (raw: string | null | undefined) => nextPathWithin("/admin", raw, "/admin/login");

/** Host login: back to a /dashboard page, never off-site (it was an open redirect). */
export const hostNextPath = (raw: string | null | undefined) => nextPathWithin("/dashboard", raw);
