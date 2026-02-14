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
      <BookingHeader homestayName={homestay.name} themeColor={homestay.theme_color} />

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
        />

        <RoomsSection rooms={rooms} />

        {/* Map + Booking: map left, form right */}
        <section className="py-8">
          <div className="mx-auto max-w-7xl px-4 sm:px-6">
            <div className="grid grid-cols-1 gap-8 lg:grid-cols-5">
              {/* Left: Map */}
              {homestay.map_embed_url && (
                <div className="lg:col-span-2">
                  <div className="sticky top-20 space-y-3">
                    <h2 className="text-xl font-semibold text-gray-900">
                      {homestay.location}
                    </h2>
                    <div className="overflow-hidden rounded-xl border">
                      <iframe
                        src={homestay.map_embed_url}
                        className="h-80 w-full lg:h-[450px]"
                        loading="lazy"
                        allowFullScreen
                        referrerPolicy="no-referrer-when-downgrade"
                        title="Map"
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* Right: Booking Form */}
              <div className={homestay.map_embed_url ? "lg:col-span-3" : "lg:col-span-5"}>
                <BookingSection
                  homestay={homestay}
                  rooms={rooms}
                  blockedDates={blockedDates}
                  bookedRanges={bookedRanges}
                  host={homestay.host}
                  embedded
                />
              </div>
            </div>
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
