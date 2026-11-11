import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { Breadcrumbs } from "@/components/seo/breadcrumbs";

vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children?: ReactNode }) => createElement("a", { href, ...rest }, children),
}));

const items = [{ label: "Peaksnature", href: "/" }, { label: "บ้านริมธาร" }];
const html = (visuallyHidden?: boolean) => renderToStaticMarkup(createElement(Breadcrumbs, { items, visuallyHidden }));

describe("Breadcrumbs", () => {
  it("keeps visually hidden links out of the tab order: focus would land on nothing visible", () => {
    expect(html(true)).toContain('tabindex="-1"');
  });

  it("leaves visible breadcrumb links in the tab order", () => {
    expect(html()).not.toContain("tabindex");
  });
});
