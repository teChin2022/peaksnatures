import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Upload Payment Slip",
  description: "Upload your payment slip to confirm your booking.",
  robots: { index: false, follow: false },
};

export default function UploadSlipLayout({ children }: { children: React.ReactNode }) {
  return children;
}
