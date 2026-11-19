import { generateObject } from "ai";
import { google } from "@ai-sdk/google";
import { modelReplySchema, type ModelReply } from "./rules";

/**
 * The one place the guest assistant's model is named (D10, owner 2026-11-19).
 * Google recommends 3.5 Flash-Lite or 3.8 Flash for new projects; swap here.
 */
export const GUEST_AI_MODEL = "gemini-3.5-flash-lite";

/** Bounded in time and size (security review F-07): a slow or long answer costs the platform. */
const TIMEOUT_MS = 15_000;
const MAX_OUTPUT_TOKENS = 600;

/**
 * One structured answer from Gemini, with its token counts (087, for the admin cost report).
 * Throws on timeout, a refusal or output that fails the schema.
 */
export async function askGuestAi(
  system: string,
  prompt: string,
): Promise<{ reply: ModelReply; inputTokens: number; outputTokens: number }> {
  const { object, usage } = await generateObject({
    model: google(GUEST_AI_MODEL),
    system,
    prompt,
    schema: modelReplySchema,
    temperature: 0.2,
    maxOutputTokens: MAX_OUTPUT_TOKENS,
    abortSignal: AbortSignal.timeout(TIMEOUT_MS),
    // One question, one JSON reply: no deep reasoning. Minimal is 3.5 Flash-Lite's default today;
    // pinned so a default change or a model swap does not slow every reply unnoticed.
    providerOptions: { google: { thinkingConfig: { thinkingLevel: "minimal" } } },
  });
  return { reply: object, inputTokens: usage.inputTokens ?? 0, outputTokens: usage.outputTokens ?? 0 };
}
