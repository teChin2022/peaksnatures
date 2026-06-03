import { NextRequest, NextResponse } from "next/server";
import { createRateLimiter } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const limiter = createRateLimiter({ limit: 100, windowMs: 60_000 });

const NOISE_PREFIXES = [
  "chrome-extension://",
  "moz-extension://",
  "safari-extension://",
  "safari-web-extension://",
  "webkit-masked-url://",
];
const NOISE_EXACT = new Set(["about", "data", "eval", "inline", ""]);

function isNoise(blockedUri: unknown): boolean {
  if (typeof blockedUri !== "string") return true;
  if (NOISE_EXACT.has(blockedUri)) return true;
  return NOISE_PREFIXES.some((prefix) => blockedUri.startsWith(prefix));
}

interface NormalizedReport {
  documentUri?: string;
  violatedDirective?: string;
  effectiveDirective?: string;
  blockedUri?: string;
  sourceFile?: string;
  lineNumber?: number;
  columnNumber?: number;
  disposition?: string;
  originalPolicy?: string;
}

function normalizeLegacy(body: unknown): NormalizedReport | null {
  if (!body || typeof body !== "object") return null;
  const report = (body as { "csp-report"?: Record<string, unknown> })["csp-report"];
  if (!report || typeof report !== "object") return null;
  return {
    documentUri: report["document-uri"] as string | undefined,
    violatedDirective: report["violated-directive"] as string | undefined,
    effectiveDirective: report["effective-directive"] as string | undefined,
    blockedUri: report["blocked-uri"] as string | undefined,
    sourceFile: report["source-file"] as string | undefined,
    lineNumber: report["line-number"] as number | undefined,
    columnNumber: report["column-number"] as number | undefined,
    disposition: report["disposition"] as string | undefined,
    originalPolicy: report["original-policy"] as string | undefined,
  };
}

function normalizeModern(body: unknown): NormalizedReport[] {
  if (!Array.isArray(body)) return [];
  const out: NormalizedReport[] = [];
  for (const entry of body) {
    if (!entry || typeof entry !== "object") continue;
    if ((entry as { type?: unknown }).type !== "csp-violation") continue;
    const r = (entry as { body?: Record<string, unknown> }).body;
    if (!r) continue;
    out.push({
      documentUri: r.documentURL as string | undefined,
      violatedDirective: r.violatedDirective as string | undefined,
      effectiveDirective: r.effectiveDirective as string | undefined,
      blockedUri: r.blockedURL as string | undefined,
      sourceFile: r.sourceFile as string | undefined,
      lineNumber: r.lineNumber as number | undefined,
      columnNumber: r.columnNumber as number | undefined,
      disposition: r.disposition as string | undefined,
      originalPolicy: r.originalPolicy as string | undefined,
    });
  }
  return out;
}

export async function POST(request: NextRequest) {
  const limited = await limiter.check(request);
  if (limited) return limited;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return new NextResponse(null, { status: 204 });
  }

  const reports: NormalizedReport[] = [];
  const legacy = normalizeLegacy(body);
  if (legacy) reports.push(legacy);
  reports.push(...normalizeModern(body));

  for (const report of reports) {
    if (isNoise(report.blockedUri)) continue;
    console.warn("[CSP]", JSON.stringify(report));
  }

  return new NextResponse(null, { status: 204 });
}
