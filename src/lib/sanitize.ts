import sanitizeHtml from "sanitize-html";

/**
 * Allowlist mirrors the rich-text formats the dashboard TipTap editor can produce
 * (src/components/ui/rich-text-editor.tsx) and what HTMLContent renders. Pure JS —
 * no jsdom — so it runs safely in the serverless/server-component runtime.
 */
const RICH_TEXT_OPTIONS: sanitizeHtml.IOptions = {
  allowedTags: ["p", "strong", "em", "ul", "ol", "li", "br"],
  allowedAttributes: {},
};

/**
 * Sanitize host-authored rich-text HTML on the server before it is rendered via
 * `dangerouslySetInnerHTML`. Preserves null/undefined so nullable DB fields
 * (e.g. homestays.check_in_info, rooms.description) keep their type.
 */
export function sanitizeRichText<T extends string | null | undefined>(html: T): T {
  return (html == null ? html : sanitizeHtml(html, RICH_TEXT_OPTIONS)) as T;
}

/**
 * Host rich text as plain text, for meta descriptions and JSON-LD, which would
 * otherwise show the tags literally. Sanitizing first leaves only allowlisted
 * tags and the &amp; &lt; &gt; escapes, so both regexes below are exhaustive.
 */
export function richTextToPlainText(html: string | null | undefined): string {
  if (html == null) return "";
  return sanitizeRichText(html)
    .replace(/<[^>]*>/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
}
