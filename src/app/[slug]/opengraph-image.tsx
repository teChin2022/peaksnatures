import { ImageResponse } from "next/og";
import sharp from "sharp";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { SITE_NAME } from "@/lib/seo";

export const alt = "Peaksnature homestay";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

type HomestayRow = {
  name: string;
  tagline: string | null;
  location: string;
  hero_image_url: string | null;
};

/** A hero is a photo, compressed on upload; anything bigger is not one. */
const MAX_HERO_BYTES = 10 * 1024 * 1024;
/** Well past any real hero, far below sharp's own 268MP default. */
const MAX_HERO_PIXELS = 50_000_000;

/**
 * hero_image_url is whatever the host saved, so the server fetches it only
 * when it is a file in this project's own public homestay-photos bucket
 * (audit F-16: the fetch used to go to any URL). Anything else, the card
 * renders without the photo.
 */
function isOwnHomestayPhoto(url: string): boolean {
  try {
    const own = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "");
    const target = new URL(url);
    return (
      target.protocol === "https:" &&
      target.host === own.host &&
      target.pathname.startsWith("/storage/v1/object/public/homestay-photos/")
    );
  } catch {
    return false;
  }
}

// Satori only decodes PNG/JPEG/GIF/SVG, and hero uploads are WebP (compressImage).
async function heroAsJpegDataUri(url: string): Promise<string | null> {
  if (!isOwnHomestayPhoto(url)) return null;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
    if (!res.ok) return null;
    // Raster only: sharp would hand an SVG to librsvg.
    const type = res.headers.get("content-type") ?? "";
    if (!type.startsWith("image/") || type.includes("svg")) return null;
    if (Number(res.headers.get("content-length") ?? 0) > MAX_HERO_BYTES) return null;
    const bytes = await res.arrayBuffer();
    if (bytes.byteLength > MAX_HERO_BYTES) return null;
    const jpeg = await sharp(Buffer.from(bytes), { limitInputPixels: MAX_HERO_PIXELS })
      .resize(size.width, size.height, { fit: "cover" })
      .jpeg({ quality: 80 })
      .toBuffer();
    return `data:image/jpeg;base64,${jpeg.toString("base64")}`;
  } catch {
    // A broken hero must not take the whole card down.
    return null;
  }
}

export default async function Image({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const supabase = createServiceRoleClient();
  const { data } = await supabase
    .from("homestays")
    .select("name, tagline, location, hero_image_url")
    .eq("slug", slug)
    .eq("is_active", true)
    .single();

  const homestay = data as HomestayRow | null;

  const name = homestay?.name ?? SITE_NAME;
  const tagline = homestay?.tagline ?? "Book a nature homestay";
  const location = homestay?.location ?? "Thailand";
  const heroImage = homestay?.hero_image_url ? await heroAsJpegDataUri(homestay.hero_image_url) : null;

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          position: "relative",
          fontFamily: "sans-serif",
          color: "white",
          background: "#1a2e2a",
        }}
      >
        {heroImage && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={heroImage}
            alt={name}
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              width: "100%",
              height: "100%",
              objectFit: "cover",
            }}
          />
        )}
        <div
          style={{
            // Satori ignores the `inset` shorthand; spell the box out.
            position: "absolute",
            top: 0,
            left: 0,
            width: "100%",
            height: "100%",
            background:
              "linear-gradient(180deg, rgba(0,0,0,0.15) 0%, rgba(0,0,0,0.55) 60%, rgba(0,0,0,0.85) 100%)",
          }}
        />

        <div
          style={{
            position: "relative",
            display: "flex",
            flexDirection: "column",
            justifyContent: "space-between",
            padding: 72,
            width: "100%",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 14, fontSize: 24, opacity: 0.95 }}>
            <div
              style={{
                width: 40,
                height: 40,
                borderRadius: 10,
                background: "rgba(255,255,255,0.2)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 26,
              }}
            >
              ⛰
            </div>
            <span style={{ letterSpacing: 4, textTransform: "uppercase" }}>{SITE_NAME}</span>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <div
              style={{
                fontSize: 26,
                letterSpacing: 3,
                textTransform: "uppercase",
                opacity: 0.85,
              }}
            >
              {`📍 ${location}`}
            </div>
            <div
              style={{
                fontSize: 80,
                fontWeight: 700,
                lineHeight: 1.05,
                letterSpacing: -1,
                maxWidth: 1000,
              }}
            >
              {name}
            </div>
            {tagline && (
              <div
                style={{
                  fontSize: 30,
                  opacity: 0.9,
                  maxWidth: 1000,
                  lineHeight: 1.3,
                  fontStyle: "italic",
                }}
              >
                {tagline}
              </div>
            )}
          </div>
        </div>
      </div>
    ),
    size,
  );
}
