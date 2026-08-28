import { afterEach, describe, expect, it, vi } from "vitest";

/** seo.ts reads env once at module load, so each case needs a fresh module registry. */
async function loadSeo(env: Record<string, string | undefined>) {
  vi.resetModules();
  for (const [key, value] of Object.entries(env)) vi.stubEnv(key, value);
  return import("@/lib/seo");
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe("SITE_URL", () => {
  it("prefers NEXT_PUBLIC_APP_URL", async () => {
    const { SITE_URL } = await loadSeo({
      NEXT_PUBLIC_APP_URL: "https://preview.peaksnature.com",
      NEXT_PUBLIC_SITE_URL: "https://old.example.com",
    });
    expect(SITE_URL).toBe("https://preview.peaksnature.com");
  });

  it("falls back to NEXT_PUBLIC_SITE_URL for back-compat", async () => {
    const { SITE_URL } = await loadSeo({
      NEXT_PUBLIC_APP_URL: undefined,
      NEXT_PUBLIC_SITE_URL: "https://old.example.com",
    });
    expect(SITE_URL).toBe("https://old.example.com");
  });

  it("falls back to the production domain when neither is set", async () => {
    const { SITE_URL } = await loadSeo({
      NEXT_PUBLIC_APP_URL: undefined,
      NEXT_PUBLIC_SITE_URL: undefined,
    });
    expect(SITE_URL).toBe("https://peaksnature.com");
  });

  it("strips a trailing slash so joined paths never double up", async () => {
    const { SITE_URL, absoluteUrl } = await loadSeo({ NEXT_PUBLIC_APP_URL: "https://peaksnature.com/" });
    expect(SITE_URL).toBe("https://peaksnature.com");
    expect(absoluteUrl("/about")).toBe("https://peaksnature.com/about");
  });
});

describe("absoluteUrl", () => {
  it("joins a rooted path onto the site URL", async () => {
    const { absoluteUrl } = await loadSeo({ NEXT_PUBLIC_APP_URL: "https://peaksnature.com" });
    expect(absoluteUrl("/homestay/doi-inthanon")).toBe("https://peaksnature.com/homestay/doi-inthanon");
  });

  it("adds the missing leading slash", async () => {
    const { absoluteUrl } = await loadSeo({ NEXT_PUBLIC_APP_URL: "https://peaksnature.com" });
    expect(absoluteUrl("about")).toBe("https://peaksnature.com/about");
  });

  it("returns the bare site URL for the root path", async () => {
    const { absoluteUrl } = await loadSeo({ NEXT_PUBLIC_APP_URL: "https://peaksnature.com" });
    expect(absoluteUrl("/")).toBe("https://peaksnature.com/");
  });
});

describe("buildAlternates", () => {
  it("points the canonical and every language at the same URL", async () => {
    const { buildAlternates } = await loadSeo({ NEXT_PUBLIC_APP_URL: "https://peaksnature.com" });
    expect(buildAlternates("/doi-inthanon")).toEqual({
      canonical: "https://peaksnature.com/doi-inthanon",
      languages: {
        en: "https://peaksnature.com/doi-inthanon",
        th: "https://peaksnature.com/doi-inthanon",
        "x-default": "https://peaksnature.com/doi-inthanon",
      },
    });
  });
});

describe("locale constants", () => {
  it("defaults to Thai and maps every supported locale to an OG tag", async () => {
    const { SUPPORTED_LOCALES, DEFAULT_LOCALE, LOCALE_OG_TAGS } = await loadSeo({});
    expect(SUPPORTED_LOCALES).toEqual(["en", "th"]);
    expect(DEFAULT_LOCALE).toBe("th");
    expect(SUPPORTED_LOCALES.every((l) => typeof LOCALE_OG_TAGS[l] === "string")).toBe(true);
  });
});
