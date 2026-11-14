"use client";

import "./globals.css";
import { ErrorView } from "@/components/error-view";

// Replaces the root layout when it fails, so it brings its own <html>, styles
// and both languages: no intl provider exists at this level.
export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="th">
      <body className="bg-earth-50 antialiased">
        <ErrorView
          title="หน้านี้โหลดไม่สำเร็จ · This page couldn't load"
          description="เกิดข้อผิดพลาดบางอย่าง ลองอีกครั้ง หรือกลับไปหน้าหลัก · Something went wrong. Try again, or go back to the home page."
          retryLabel="ลองอีกครั้ง · Try again"
          onRetry={reset}
          backHref="/"
          backLabel="กลับหน้าหลัก · Back to home"
        />
      </body>
    </html>
  );
}
