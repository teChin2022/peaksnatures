import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { StatusBadge, statusToneClass } from "@/components/admin/status-badge";

describe("statusToneClass", () => {
  it("gives every booking status the admin tone, so host and admin colours match", () => {
    expect(statusToneClass("confirmed")).toContain("bg-brand-50");
    expect(statusToneClass("verified")).toBe(statusToneClass("confirmed"));
    expect(statusToneClass("pending")).toContain("bg-amber-50");
    expect(statusToneClass("completed")).toContain("bg-earth-50");
    // red-700 on red-50 (about 6:1): the shadcn destructive red on its 10% tint was 4.0:1.
    expect(statusToneClass("cancelled")).toContain("text-red-700");
    expect(statusToneClass("rejected")).toBe(statusToneClass("cancelled"));
  });

  it("falls back to muted for an unknown status, and an explicit tone wins", () => {
    expect(statusToneClass("whatever")).toBe(statusToneClass("inactive"));
    expect(statusToneClass("scheduled", "earth")).toBe(statusToneClass("completed"));
  });
});

describe("StatusBadge text", () => {
  const html = (props: Parameters<typeof StatusBadge>[0]) => renderToStaticMarkup(createElement(StatusBadge, props));

  it("reads a status code as words", () => {
    expect(html({ status: "pending_review" })).toContain(">Pending review<");
    expect(html({ status: "admin" })).toContain(">Admin<");
  });

  // CSS `capitalize` used to turn "No LINE alerts" into "No LINE Alerts".
  it("shows an explicit label exactly as written, with no case rewrite", () => {
    const out = html({ status: "inactive", label: "No LINE alerts" });
    expect(out).toContain(">No LINE alerts<");
    expect(out).not.toContain("capitalize");
  });
});
