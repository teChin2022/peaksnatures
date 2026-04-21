import { ImageResponse } from "next/og";
import { SITE_NAME, SITE_DESCRIPTION } from "@/lib/seo";

export const runtime = "edge";
export const alt = SITE_NAME;
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: 80,
          background:
            "linear-gradient(135deg, #2F5D50 0%, #16a34a 55%, #065f46 100%)",
          color: "white",
          fontFamily: "sans-serif",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 16, fontSize: 28, opacity: 0.85 }}>
          <div
            style={{
              width: 42,
              height: 42,
              borderRadius: 12,
              background: "rgba(255,255,255,0.15)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 28,
            }}
          >
            ⛰
          </div>
          <span style={{ letterSpacing: 4, textTransform: "uppercase" }}>{SITE_NAME}</span>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          <div
            style={{
              fontSize: 84,
              fontWeight: 700,
              lineHeight: 1.05,
              letterSpacing: -1,
              maxWidth: 960,
            }}
          >
            Nature homestay booking in Thailand
          </div>
          <div style={{ fontSize: 30, opacity: 0.9, maxWidth: 960, lineHeight: 1.35 }}>
            {SITE_DESCRIPTION}
          </div>
        </div>

        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 22, opacity: 0.8 }}>
          <span>peaksnature.com</span>
          <span>Verified hosts · Real reviews · Instant confirmation</span>
        </div>
      </div>
    ),
    size,
  );
}
