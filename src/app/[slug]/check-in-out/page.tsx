import { cache } from "react";
import type { Metadata } from "next";
import { notFound, permanentRedirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { resolveSlugRedirect } from "@/lib/slug-redirect";
import { BookingSearchView } from "@/components/booking/booking-search-view";
import { Breadcrumbs } from "@/components/seo/breadcrumbs";
import type { Homestay, Host } from "@/types/database";
import { SITE_NAME, buildAlternates } from "@/lib/seo";

export const revalidate = 30;

interface PageProps {
  params: Promise<{ slug: string }>;
}

const getHomestayWithHost = cache(async function getHomestayWithHost(slug: string) {
  const supabase = createServiceRoleClient();
  const { data: homestayRow } = await supabase
    .from("homestays")
    .select("id, name, slug, logo_url, hero_image_url, host_id")
    .eq("slug", slug)
    .eq("is_active", true)
    .single();
  if (!homestayRow) return null;
  const homestay = homestayRow as unknown as Pick<Homestay, "id" | "name" | "slug" | "logo_url" | "hero_image_url" | "host_id">;
  const { data: hostRow } = await supabase
    .from("hosts")
    .select("name, promptpay_id, cancellation_days, payment_display, bank_name, bank_account_number, bank_account_name")
    .eq("id", homestay.host_id)
    .single();
  return { homestay, host: hostRow as unknown as Pick<Host, "name" | "promptpay_id" | "cancellation_days" | "payment_display" | "bank_name" | "bank_account_number" | "bank_account_name"> | null };
});

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const data = await getHomestayWithHost(slug);
  if (!data) return { title: "Not Found", robots: { index: false, follow: false } };

  const title = `Check-in / Check-out — ${data.homestay.name} | ${SITE_NAME}`;
  return {
    title: { absolute: title },
    description: `Manage your check-in and check-out at ${data.homestay.name}.`,
    alternates: buildAlternates(`/${slug}/check-in-out`),
    robots: { index: false, follow: false },
  };
}

export default async function CheckInOutPage({ params }: PageProps) {
  const { slug } = await params;
  const data = await getHomestayWithHost(slug);

  if (!data) {
    const newSlug = await resolveSlugRedirect(slug);
    if (newSlug) permanentRedirect(`/${newSlug}/check-in-out`);
    notFound();
  }

  const { homestay, host } = data;
  const tp = await getTranslations("checkInOutPage");
  const tNav = await getTranslations("reviewsPage");

  return (
    <div className="flex min-h-screen flex-col bg-earth-50 pb-[env(safe-area-inset-bottom)]">
      <Breadcrumbs
        items={[
          { label: SITE_NAME, href: "/" },
          { label: homestay.name, href: `/${homestay.slug}` },
          { label: "Check-in / Check-out" },
        ]}
        visuallyHidden
      />

      <header className="sticky top-0 z-30 border-b border-earth-200 bg-earth-50/80 backdrop-blur-sm">
        <div className="mx-auto flex h-14 max-w-2xl items-center px-4">
          <Link
            href={`/${homestay.slug}`}
            className="flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs text-earth-600 transition-colors hover:bg-earth-100 hover:text-earth-900"
          >
            <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
            <span className="hidden sm:inline">{tNav("backToHomestay")}</span>
          </Link>
        </div>
      </header>

      <main className="flex-1 px-4 py-10 md:py-14">
        <div className="mx-auto max-w-2xl space-y-8">
          <header className="text-center">
            <span className="inline-block rounded-full bg-brand-50 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-brand">
              {tp("pill")}
            </span>
            <h1 className="mt-4 font-serif text-3xl font-normal leading-tight text-earth-900 md:text-4xl">
              {tp("title")}
            </h1>
            <p className="mx-auto mt-3 max-w-md text-sm leading-relaxed text-earth-500">
              {tp("subtitle")}
            </p>
          </header>

          <BookingSearchView
            mode="check-in-out"
            homestayId={homestay.id}
            hostName={host?.name}
            promptpayId={host?.promptpay_id}
            cancellationDays={host?.cancellation_days}
            paymentDisplay={host?.payment_display}
            bankName={host?.bank_name}
            bankAccountNumber={host?.bank_account_number}
            bankAccountName={host?.bank_account_name}
          />
        </div>
      </main>
    </div>
  );
}
