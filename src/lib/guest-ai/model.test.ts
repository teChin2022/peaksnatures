import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({ generateObject: vi.fn(), google: vi.fn((id: string) => `model:${id}`) }));
vi.mock("ai", () => ({ generateObject: h.generateObject }));
vi.mock("@ai-sdk/google", () => ({ google: h.google }));

import { GUEST_AI_MODEL, askGuestAi } from "./model";

const REPLY = { reply: "เช็คอินบ่ายสองโมงค่ะ", answered: true, intent: null, action: null, houses: [] };

describe("askGuestAi", () => {
  beforeEach(() => h.generateObject.mockReset());

  it("asks the pinned model with minimal thinking, bounded, and returns the reply with its tokens", async () => {
    h.generateObject.mockResolvedValue({ object: REPLY, usage: { inputTokens: 1200, outputTokens: 90 } });
    await expect(askGuestAi("sys", "user")).resolves.toEqual({ reply: REPLY, inputTokens: 1200, outputTokens: 90 });
    const call = h.generateObject.mock.calls[0][0];
    expect(call.model).toBe(`model:${GUEST_AI_MODEL}`);
    expect(call.providerOptions).toEqual({ google: { thinkingConfig: { thinkingLevel: "minimal" } } });
    expect(call.maxOutputTokens).toBe(600);
    expect(call.abortSignal).toBeInstanceOf(AbortSignal);
  });

  it("counts missing token numbers as 0", async () => {
    h.generateObject.mockResolvedValue({ object: REPLY, usage: {} });
    await expect(askGuestAi("sys", "user")).resolves.toMatchObject({ inputTokens: 0, outputTokens: 0 });
  });
});
