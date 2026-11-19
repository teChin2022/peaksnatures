import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Security review F-09, in place of the `server-only` package (owner, 2026-11-19): the code that
 * calls Gemini reads GOOGLE_GENERATIVE_AI_API_KEY and must never reach a browser bundle. A build
 * only notices when the chain hits next/headers or ioredis, so these imports are checked here.
 */

const SRC = join(process.cwd(), "src");
const SERVER_ONLY = [/["']@ai-sdk\/google["']/, /["']@\/lib\/guest-ai\/model["']/, /["']@\/lib\/translation\/(translate-homestay|localize-strings)["']/];

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return /\.(ts|tsx)$/.test(name) && !/\.test\.tsx?$/.test(name) ? [path] : [];
  });
}

const files = sourceFiles(SRC).map((path) => ({ path: relative(process.cwd(), path), text: readFileSync(path, "utf8") }));
const isClient = (text: string) => /^\s*["']use client["']/.test(text);

describe("server-only AI code", () => {
  it("is never imported by a \"use client\" file", () => {
    const offenders = files
      .filter((f) => isClient(f.text) && SERVER_ONLY.some((re) => new RegExp(`from ${re.source}`).test(f.text)))
      .map((f) => f.path);
    expect(offenders).toEqual([]);
  });

  it("calls Gemini for guests only from the API route", () => {
    const importers = files.filter((f) => /from ["']@\/lib\/guest-ai\/model["']/.test(f.text)).map((f) => f.path);
    expect(importers).toEqual(["src/app/api/guest-ai/route.ts"]);
  });

  it("keeps the client-shared guest AI modules free of server imports", () => {
    // rules.ts is imported by the assistant ("use client"); it may only use zod and import-free constants.
    const shared = files.filter((f) => /src\/lib\/guest-ai\/rules\.ts$/.test(f.path));
    expect(shared).toHaveLength(1);
    const imports = [...shared[0].text.matchAll(/from ["']([^"']+)["']/g)].map((m) => m[1]);
    expect(imports.every((i) => i === "zod" || i === "@/lib/wallet-thresholds")).toBe(true);
  });
});
