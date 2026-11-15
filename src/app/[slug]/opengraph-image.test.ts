import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import sharp from "sharp";
import Image from "./opengraph-image";
import { createSupabaseMock, type SupabaseMock } from "../../../test/helpers/supabase";

const mocks = vi.hoisted(() => ({ createServiceRoleClient: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({
  createServiceRoleClient: mocks.createServiceRoleClient,
}));

const SLUG = "mon-ngo-viewmok";
const HERO = "https://x.supabase.co/storage/v1/object/public/homestay-photos/hero.webp";
const PNG_MAGIC = [0x89, 0x50, 0x4e, 0x47];

let supabase: SupabaseMock;
let heroResponse: () => Response;

beforeEach(async () => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://x.supabase.co");
  supabase = createSupabaseMock({
    tables: {
      homestays: {
        data: { name: "Mon Ngo Viewmok", tagline: "Above the clouds", location: "Chiang Mai", hero_image_url: HERO },
      },
    },
  });
  mocks.createServiceRoleClient.mockReturnValue(supabase);

  // What compressImage() uploads: a WebP, which Satori cannot decode.
  const webp = await sharp({ create: { width: 64, height: 32, channels: 3, background: "green" } }).webp().toBuffer();
  heroResponse = () => new Response(new Uint8Array(webp), { headers: { "content-type": "image/webp" } });
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      if (url === HERO) return heroResponse();
      // next/og fetches twemoji glyphs for 📍 and ⛰.
      if (url.endsWith(".svg")) return new Response('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 36 36"></svg>');
      return new Response("", { status: 404 });
    }),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

const render = async () =>
  new Uint8Array(await (await Image({ params: Promise.resolve({ slug: SLUG }) })).arrayBuffer());

describe("[slug]/opengraph-image", () => {
  // Pins the three bugs behind "failed to pipe response" in production: the
  // multi-child <div> without display:flex, sync access to the params Promise,
  // and a WebP hero reaching Satori.
  it("renders the homestay's card from a WebP hero", async () => {
    const png = await render();

    expect([...png.slice(0, 4)]).toEqual(PNG_MAGIC);
    expect(supabase.calls[0].builder.eq).toHaveBeenCalledWith("slug", SLUG);
    expect(fetch).toHaveBeenCalledWith(HERO, expect.objectContaining({ signal: expect.anything() }));
  });

  it("still renders when the hero cannot be fetched", async () => {
    heroResponse = () => new Response("", { status: 404 });

    const png = await render();

    expect([...png.slice(0, 4)]).toEqual(PNG_MAGIC);
  });
});

// F-16: hero_image_url is whatever the host typed, and the server fetched it
// with no allowlist (SSRF) and fed the bytes to sharp. Only this project's own
// homestay-photos bucket is fetched now; anything else renders the text card.
describe("[slug]/opengraph-image: what it will fetch", () => {
  const withHero = (url: string) => {
    supabase = createSupabaseMock({
      tables: { homestays: { data: { name: "Mon Ngo Viewmok", tagline: null, location: "Chiang Mai", hero_image_url: url } } },
    });
    mocks.createServiceRoleClient.mockReturnValue(supabase);
  };

  it.each([
    ["the cloud metadata address", "http://169.254.169.254/latest/meta-data/"],
    ["another site", "https://evil.example/hero.webp"],
    ["plain http on the project's own host", "http://x.supabase.co/storage/v1/object/public/homestay-photos/hero.webp"],
    ["another bucket on the project's host", "https://x.supabase.co/storage/v1/object/public/payment-slips/slip.jpg"],
    ["a look-alike host", "https://x.supabase.co.evil.example/storage/v1/object/public/homestay-photos/hero.webp"],
    ["not a URL at all", "javascript:alert(1)"],
  ])("does not fetch %s, and still renders the card", async (_, url) => {
    withHero(url);

    const png = await render();

    expect([...png.slice(0, 4)]).toEqual(PNG_MAGIC);
    expect(vi.mocked(fetch).mock.calls.some((c) => String(c[0]) === url)).toBe(false);
  });

  /** sharp decodes this many times in one render; next/og uses sharp itself too. */
  const sharpDecodes = async () => {
    const toBuffer = vi.spyOn(sharp.prototype, "toBuffer");
    await render();
    const n = toBuffer.mock.calls.length;
    toBuffer.mockRestore();
    return n;
  };
  /** The count with no hero decoded at all: the fetch fails. */
  const withoutHero = async () => {
    const saved = heroResponse;
    heroResponse = () => new Response("", { status: 404 });
    const n = await sharpDecodes();
    heroResponse = saved;
    return n;
  };

  it("decodes a real WebP hero (so the counts below mean something)", async () => {
    const baseline = await withoutHero();
    expect(await sharpDecodes()).toBe(baseline + 1);
  });

  it("does not decode an SVG served as the hero", async () => {
    const baseline = await withoutHero();
    heroResponse = () => new Response('<svg xmlns="http://www.w3.org/2000/svg"/>', { headers: { "content-type": "image/svg+xml" } });
    expect(await sharpDecodes()).toBe(baseline);
  });

  it("does not download a hero larger than the cap", async () => {
    const baseline = await withoutHero();
    heroResponse = () =>
      new Response(new Uint8Array(16), { headers: { "content-type": "image/webp", "content-length": String(50 * 1024 * 1024) } });
    expect(await sharpDecodes()).toBe(baseline);
  });
});
