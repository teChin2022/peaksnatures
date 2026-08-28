import { NextRequest } from "next/server";

interface RequestOptions {
  method?: string;
  body?: unknown;
  headers?: Record<string, string>;
  searchParams?: Record<string, string>;
  ip?: string;
}

/** Build a NextRequest for a route handler, defaulting to a JSON POST. */
export function makeRequest(path = "/api/test", options: RequestOptions = {}): NextRequest {
  const { method = "POST", body, headers = {}, searchParams, ip } = options;
  const url = new URL(path, "http://localhost:3000");
  for (const [key, value] of Object.entries(searchParams ?? {})) {
    url.searchParams.set(key, value);
  }

  const allHeaders: Record<string, string> = { ...headers };
  if (ip) allHeaders["x-forwarded-for"] = ip;
  if (body !== undefined && !("content-type" in allHeaders)) {
    allHeaders["content-type"] = "application/json";
  }

  return new NextRequest(url, {
    method,
    headers: allHeaders,
    ...(body === undefined ? {} : { body: typeof body === "string" ? body : JSON.stringify(body) }),
  });
}

/** Read a route handler's JSON response as `{ status, body }`. */
export async function readJson(response: Response): Promise<{ status: number; body: unknown }> {
  return { status: response.status, body: await response.json() };
}

/** Build a multipart NextRequest, for the routes that take an uploaded file. */
export function makeFormRequest(
  path: string,
  fields: Record<string, string | File>,
  options: { ip?: string } = {},
): NextRequest {
  const form = new FormData();
  for (const [key, value] of Object.entries(fields)) form.append(key, value);

  const url = new URL(path, "http://localhost:3000");
  const request = new Request(url, { method: "POST", body: form });
  const headers = new Headers(request.headers);
  if (options.ip) headers.set("x-forwarded-for", options.ip);

  return new NextRequest(url, {
    method: "POST",
    headers,
    body: request.body,
    duplex: "half",
  } as unknown as ConstructorParameters<typeof NextRequest>[1]);
}

let ipCounter = 0;

/**
 * A client address no other test has used. Route modules build their rate
 * limiter once at import time, so cases in one file share its counters — a
 * fresh address per request keeps them in separate buckets.
 */
export function uniqueIp(): string {
  ipCounter += 1;
  return `10.0.${Math.floor(ipCounter / 254)}.${(ipCounter % 254) + 1}`;
}
