import { ImageResponse } from "next/og";
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

export default async function Image({ params }: { params: { slug: string } }) {
  const supabase = createServiceRoleClient();
  const { data } = await supabase
    .from("homestays")
    .select("name, tagline, location, hero_image_url")
    .eq("slug", params.slug)
    .eq("is_active", true)
    .single();

  const homestay = data as HomestayRow | null;

  const name = homestay?.name ?? SITE_NAME;
  const tagline = homestay?.tagline ?? "Book a nature homestay";
  const location = homestay?.location ?? "Thailand";
  const heroImageUrl = homestay?.hero_image_url ?? null;

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
        {heroImageUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={heroImageUrl}
            alt={name}
            style={{
              position: "absolute",
              inset: 0,
              width: "100%",
              height: "100%",
              objectFit: "cover",
            }}
          />
        )}
        <div
          style={{
            position: "absolute",
            inset: 0,
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
              📍 {location}
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
