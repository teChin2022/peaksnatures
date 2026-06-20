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
