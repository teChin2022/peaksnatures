import type { Metadata } from "next";
import { NextIntlClientProvider } from "next-intl";
import en from "../../../../messages/en.json";

export const metadata: Metadata = {
  // The admin layout's plain-string title drops the root "%s | Peaksnature" template, so name the brand here.
  title: "Admin Login | Peaksnature",
  description: "Sign in to the Peaksnature admin dashboard.",
  robots: { index: false, follow: false },
};

export default function AdminLoginLayout({ children }: { children: React.ReactNode }) {
  // Parent admin layout already skips AdminShell for /admin/login.
  // /admin is English-only, but the shared OtpModal reads next-intl, whose site locale defaults to Thai.
  // A server layout, so only these two namespaces reach the browser.
  return (
    <NextIntlClientProvider locale="en" messages={{ auth: en.auth, common: en.common }}>
      {children}
    </NextIntlClientProvider>
  );
}
