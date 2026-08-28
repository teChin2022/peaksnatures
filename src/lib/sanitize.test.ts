import { describe, expect, it } from "vitest";
import { sanitizeRichText } from "@/lib/sanitize";

describe("sanitizeRichText", () => {
  it("keeps the formatting the rich-text editor can produce", () => {
    const html = "<p>Hello <strong>there</strong> and <em>welcome</em></p>";
    expect(sanitizeRichText(html)).toBe(html);
  });

  it("keeps both list kinds and line breaks", () => {
    const html = "<ul><li>One</li></ul><ol><li>Two</li></ol><p>Three<br />Four</p>";
    expect(sanitizeRichText(html)).toBe("<ul><li>One</li></ul><ol><li>Two</li></ol><p>Three<br />Four</p>");
  });

  it("strips a script tag and its contents", () => {
    expect(sanitizeRichText("<p>Hi</p><script>alert('xss')</script>")).toBe("<p>Hi</p>");
  });

  it("strips inline event handlers and style attributes", () => {
    expect(sanitizeRichText(`<p onclick="steal()" style="color:red">Hi</p>`)).toBe("<p>Hi</p>");
  });

  it("strips tags outside the allowlist but keeps their text", () => {
    expect(sanitizeRichText(`<a href="http://evil.test">link</a>`)).toBe("link");
    expect(sanitizeRichText(`<img src="x" onerror="steal()">`)).toBe("");
    expect(sanitizeRichText("<h1>Title</h1>")).toBe("Title");
    expect(sanitizeRichText("<iframe src='http://evil.test'></iframe>")).toBe("");
  });

  it("preserves null and undefined so nullable columns keep their type", () => {
    expect(sanitizeRichText(null)).toBeNull();
    expect(sanitizeRichText(undefined)).toBeUndefined();
  });

  it("passes an empty string through", () => {
    expect(sanitizeRichText("")).toBe("");
  });

  it("leaves plain text untouched", () => {
    expect(sanitizeRichText("Just words, no markup.")).toBe("Just words, no markup.");
  });
});
