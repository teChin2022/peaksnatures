import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { createServiceRoleClient } from "@/lib/supabase/server";
import type { Homestay, Room, BlockedDate, Host } from "@/types/database";
import { HeroSection } from "@/components/booking/hero-section";
import { GallerySection } from "@/components/booking/gallery-section";
import { AboutSection } from "@/components/booking/about-section";
import { RoomsSection } from "@/components/booking/rooms-section";
import { BookingSection } from "@/components/booking/booking-section";
import { BookingHeader } from "@/components/booking/booking-header";
import { ChatWidget } from "@/components/chat/chat-widget";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ slug: string }>;
}

async function getHomestayData(slug: string) {
  const supabase = createServiceRoleClient();

  const { data: homestayRow } = await supabase
    .from("homestays")
    .select("*")
    .eq("slug", slug)
    .eq("is_active", true)
    .single();

  if (!homestayRow) return null;

  const homestay = homestayRow as unknown as Homestay;

  // Fetch host
  const { data: hostRow } = await supabase
    .from("hosts")
    .select("*")
    .eq("id", homestay.host_id)
    .single();
  const host = hostRow as unknown as Host | null;

  // Fetch rooms
  const { data: roomRows } = await supabase
    .from("rooms")
    .select("*")
    .eq("homestay_id", homestay.id);
  const rooms = (roomRows as unknown as Room[]) || [];

  // Fetch blocked dates
  const { data: blockedRows } = await supabase
    .from("blocked_dates")
    .select("*")
    .eq("homestay_id", homestay.id);
  const blockedDates = (blockedRows as unknown as BlockedDate[]) || [];

  // Fetch active bookings for availability check
  const { data: bookingRows } = await supabase
    .from("bookings")
    .select("room_id, check_in, check_out")
    .eq("homestay_id", homestay.id)
    .in("status", ["pending", "confirmed", "verified"]);
  const bookedRanges = (bookingRows as { room_id: string | null; check_in: string; check_out: string }[]) || [];

  return {
    homestay: { ...homestay, host: host! } as Homestay & { host: Host },
    rooms,
    blockedDates,
    bookedRanges,
  };
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const data = await getHomestayData(slug);

  if (!data) {
    return { title: "Not Found — PeaksNature" };
  }

  const { homestay } = data;
  return {
    title: `${homestay.name} — Book Now | PeaksNature`,
    description: `${homestay.description.slice(0, 155)}...`,
    openGraph: {
      title: homestay.name,
      description: homestay.tagline || homestay.description.slice(0, 155),
      images: homestay.hero_image_url ? [{ url: homestay.hero_image_url }] : [],
    },
  };
}

export default async function HomestayPage({ params }: PageProps) {
  const { slug } = await params;
  const data = await getHomestayData(slug);

  if (!data) {
    notFound();
  }

  const { homestay, rooms, blockedDates, bookedRanges } = data;

  return (
    <div className="min-h-screen bg-white">
      <BookingHeader homestayName={homestay.name} themeColor={homestay.theme_color} logoUrl={homestay.logo_url} />

      <main>
        <HeroSection
          name={homestay.name}
          tagline={homestay.tagline}
          heroImageUrl={homestay.hero_image_url}
          themeColor={homestay.theme_color}
        />

        <GallerySection images={homestay.gallery} name={homestay.name} />

        <AboutSection
          description={homestay.description}
          amenities={homestay.amenities}
          maxGuests={homestay.max_guests}
          location={homestay.location}
          themeColor={homestay.theme_color}
        />

        <RoomsSection rooms={rooms} themeColor={homestay.theme_color} />

        {/* Map Section */}
        {homestay.map_embed_url && (
          <section className="bg-gray-50/60 py-10">
            <div className="mx-auto max-w-7xl px-4 sm:px-6">
              <div className="flex items-center gap-2">
                <div
                  className="flex h-8 w-8 items-center justify-center rounded-lg"
                  style={{ backgroundColor: homestay.theme_color + '15' }}
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: homestay.theme_color }}><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/></svg>
                </div>
                <div>
                  <h2 className="text-xl font-semibold text-gray-900">Location</h2>
                  <p className="text-sm text-gray-500">{homestay.location}</p>
                </div>
              </div>
              <div className="mt-4 overflow-hidden rounded-2xl border bg-white shadow-sm">
                <iframe
                  src={homestay.map_embed_url}
                  className="h-80 w-full lg:h-[400px]"
                  loading="lazy"
                  allowFullScreen
                  referrerPolicy="no-referrer-when-downgrade"
                  title="Map"
                />
              </div>
            </div>
          </section>
        )}

        {/* Booking Form */}
        <section className="py-10">
          <div className="mx-auto max-w-7xl px-4 sm:px-6">
            <BookingSection
              homestay={homestay}
              rooms={rooms}
              blockedDates={blockedDates}
              bookedRanges={bookedRanges}
              host={homestay.host}
              embedded
            />
          </div>
        </section>
      </main>

      <ChatWidget
        homestayId={homestay.id}
        homestayName={homestay.name}
        themeColor={homestay.theme_color}
      />
    </div>
  );
}
