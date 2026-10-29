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
    expect(fetch).toHaveBeenCalledWith(HERO);
  });

  it("still renders when the hero cannot be fetched", async () => {
    heroResponse = () => new Response("", { status: 404 });

    const png = await render();

    expect([...png.slice(0, 4)]).toEqual(PNG_MAGIC);
  });
});
