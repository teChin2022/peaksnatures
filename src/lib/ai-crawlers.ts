import { HTML_LIMITED_BOT_UA_RE } from "next/dist/shared/lib/router/utils/html-bots";

// AI crawlers don't run JS, and Next's default list misses them, so they got
// <title>, description and canonical streamed into <body> instead of <head>.
// Setting `htmlLimitedBots` replaces that default list, so this extends it.
export const HTML_LIMITED_BOTS = new RegExp(
  `${HTML_LIMITED_BOT_UA_RE.source}|GPTBot|OAI-SearchBot|ChatGPT-User|ClaudeBot|Claude-SearchBot|Claude-User|PerplexityBot|Perplexity-User|CCBot|Amazonbot|meta-externalagent|DuckAssistBot|MistralAI-User`,
  "i",
);
