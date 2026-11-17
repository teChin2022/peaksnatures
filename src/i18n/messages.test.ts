import { createTranslator, IntlErrorCode, type IntlError } from "next-intl";
import { describe, expect, it } from "vitest";
import en from "../../messages/en.json";
import th from "../../messages/th.json";

/** Every leaf message key, dotted. */
function keys(node: unknown, prefix = ""): string[] {
  if (typeof node === "string") return [prefix];
  if (node && typeof node === "object") {
    return Object.entries(node).flatMap(([k, v]) => keys(v, prefix ? `${prefix}.${k}` : k));
  }
  return [];
}

// next-intl parses each message as ICU MessageFormat. A literal "<tag>" that is
// not rich text fails with INVALID_MESSAGE and the page shows the raw key instead
// (dashboardGuide.step3Item3, 2026-11-17). Missing placeholder values are not
// checked here: only messages that cannot be parsed at all.
describe.each([
  ["th", th],
  ["en", en],
])("messages/%s.json", (locale, messages) => {
  it("parses as ICU MessageFormat", () => {
    const broken: string[] = [];
    // Keys come from the file itself, so the typed key union adds nothing here.
    const t = createTranslator({
      locale,
      messages,
      onError: (e: IntlError) => {
        if (e.code === IntlErrorCode.INVALID_MESSAGE) broken.push(e.message);
      },
    }) as unknown as (key: string) => string;
    for (const key of keys(messages)) t(key);
    expect(broken).toEqual([]);
  });
});
