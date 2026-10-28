import { describe, expect, it } from "vitest";
import { HTML_LIMITED_BOTS } from "@/lib/ai-crawlers";

describe("HTML_LIMITED_BOTS", () => {
  it.each([
    "Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; GPTBot/1.2; +https://openai.com/gptbot)",
    "Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; ClaudeBot/1.0; +claudebot@anthropic.com)",
    "Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; PerplexityBot/1.0; +https://perplexity.ai/perplexitybot)",
  ])("gets a blocking render for AI crawler %s", (ua) => {
    expect(HTML_LIMITED_BOTS.test(ua)).toBe(true);
  });

  it("keeps Next's default list, which the htmlLimitedBots option otherwise replaces", () => {
    expect(HTML_LIMITED_BOTS.test("Mozilla/5.0 (compatible; bingbot/2.0; +http://www.bing.com/bingbot.htm)")).toBe(true);
  });

  it("leaves real browsers on the streaming path", () => {
    const iphoneSafari =
      "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1";
    expect(HTML_LIMITED_BOTS.test(iphoneSafari)).toBe(false);
  });
});
