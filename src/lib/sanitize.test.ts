import { describe, expect, it } from "vitest";
import { richTextToPlainText, sanitizeRichText } from "@/lib/sanitize";

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

describe("richTextToPlainText", () => {
  // The live meta description on /view-sudkhet carried these tags verbatim.
  it("turns paragraphs and line breaks into spaces", () => {
    const html = "<p>ทิ้งความวุ่นวายไว้ข้างล่าง<br />โฮมสเตย์เล็ก ๆ ที่ซ่อนตัวอยู่</p><p>ท่ามกลางภูเขา</p>";
    expect(richTextToPlainText(html)).toBe("ทิ้งความวุ่นวายไว้ข้างล่าง โฮมสเตย์เล็ก ๆ ที่ซ่อนตัวอยู่ ท่ามกลางภูเขา");
  });

  it("decodes the escapes sanitizing leaves, without double-decoding", () => {
    expect(richTextToPlainText("<p>Tom &amp; Jerry &lt;3</p>")).toBe("Tom & Jerry <3");
    expect(richTextToPlainText("<p>&amp;lt;</p>")).toBe("&lt;");
  });

  it("drops script content instead of leaking it into the text", () => {
    expect(richTextToPlainText("<p>Hi</p><script>alert('xss')</script>")).toBe("Hi");
  });

  it("returns an empty string for a missing description", () => {
    expect(richTextToPlainText(null)).toBe("");
    expect(richTextToPlainText(undefined)).toBe("");
  });
});
