import { cache } from "react";
import type { Metadata } from "next";
import { cookies } from "next/headers";
import { notFound, permanentRedirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { resolveSlugRedirect } from "@/lib/slug-redirect";
import { BookingSearchView } from "@/components/booking/booking-search-view";
import { Breadcrumbs } from "@/components/seo/breadcrumbs";
import { localizeStrings } from "@/lib/translation/localize-strings";
import type { SupportedLocale } from "@/lib/translation/types";
import type { Homestay, Host } from "@/types/database";
import { SITE_NAME, buildAlternates } from "@/lib/seo";
import { RespectReducedMotion } from "@/components/respect-reduced-motion";

export const revalidate = 30;

interface PageProps {
  params: Promise<{ slug: string }>;
}

const getHomestayWithHost = cache(async function getHomestayWithHost(slug: string) {
  const supabase = createServiceRoleClient();
  const { data: homestayRow } = await supabase
    .from("homestays")
    .select("id, name, slug, logo_url, hero_image_url, host_id, facebook_url")
    .eq("slug", slug)
    .eq("is_active", true)
    .single();
  if (!homestayRow) return null;
  const homestay = homestayRow as unknown as Pick<Homestay, "id" | "name" | "slug" | "logo_url" | "hero_image_url" | "host_id" | "facebook_url">;
  const { data: hostRow } = await supabase
    .from("hosts")
    .select("name, phone, promptpay_id, cancellation_days, payment_display, bank_name, bank_account_number, bank_account_name")
    .eq("id", homestay.host_id)
    .single();
  return { homestay, host: hostRow as unknown as Pick<Host, "name" | "phone" | "promptpay_id" | "cancellation_days" | "payment_display" | "bank_name" | "bank_account_number" | "bank_account_name"> | null };
});

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const data = await getHomestayWithHost(slug);
  if (!data) return { title: "Not Found", robots: { index: false, follow: false } };

  const title = `Change House / Dates — ${data.homestay.name} | ${SITE_NAME}`;
  return {
    title: { absolute: title },
    description: `Change your house or dates at ${data.homestay.name}.`,
    alternates: buildAlternates(`/${slug}/change-booking`),
    robots: { index: false, follow: false },
  };
}

export default async function ChangeBookingPage({ params }: PageProps) {
  const { slug } = await params;
  const data = await getHomestayWithHost(slug);

  if (!data) {
    const newSlug = await resolveSlugRedirect(slug);
    if (newSlug) permanentRedirect(`/${newSlug}/change-booking`);
    notFound();
  }

  const { homestay, host } = data;
  const cookieStore = await cookies();
  const locale: SupportedLocale = cookieStore.get("locale")?.value === "en" ? "en" : "th";

  const localized = await localizeStrings(
    `homestay:${homestay.id}`,
    {
      name: homestay.name,
      bank_name: host?.bank_name ?? null,
    },
    locale,
  );
  const localizedHomestay = { ...homestay, name: localized.name ?? homestay.name };
  const localizedHost = host ? { ...host, bank_name: localized.bank_name } : host;

  const tp = await getTranslations("changeBookingPage");
  const tNav = await getTranslations("reviewsPage");

  return (
    <div className="flex min-h-screen flex-col bg-earth-50 pb-[env(safe-area-inset-bottom)]">
      <Breadcrumbs
        items={[
          { label: SITE_NAME, href: "/" },
          { label: localizedHomestay.name, href: `/${homestay.slug}` },
          { label: "Change Booking" },
        ]}
        visuallyHidden
      />

      <header className="sticky top-0 z-30 border-b border-earth-200 bg-earth-50">
        <div className="mx-auto flex h-14 max-w-2xl items-center px-4">
          <Link
            href={`/${homestay.slug}`}
            aria-label={tNav("backToHomestay")}
            className="-ml-3 inline-flex min-h-11 min-w-11 items-center justify-center gap-1.5 rounded-full px-3 text-sm text-earth-700 transition-colors hover:bg-earth-100 hover:text-earth-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            <span className="hidden sm:inline">{tNav("backToHomestay")}</span>
          </Link>
        </div>
      </header>

      <main className="flex-1 px-4 py-10 md:py-14">
        <div className="mx-auto max-w-2xl space-y-8">
          <header className="text-center">
            <h1 className="font-serif text-3xl font-normal leading-tight text-earth-900 md:text-4xl">
              {tp("title")}
            </h1>
            <p className="mx-auto mt-3 max-w-md text-sm leading-relaxed text-earth-600">
              {tp("subtitle")}
            </p>
          </header>

          <RespectReducedMotion>
          <BookingSearchView
            mode="change-booking"
            homestayId={homestay.id}
            hostName={localizedHost?.name}
            promptpayId={localizedHost?.promptpay_id}
            cancellationDays={localizedHost?.cancellation_days}
            paymentDisplay={localizedHost?.payment_display}
            bankName={localizedHost?.bank_name}
            bankAccountNumber={localizedHost?.bank_account_number}
            bankAccountName={localizedHost?.bank_account_name}
            facebookUrl={homestay.facebook_url}
            hostPhone={localizedHost?.phone}
          />
          </RespectReducedMotion>
        </div>
      </main>
    </div>
  );
}
