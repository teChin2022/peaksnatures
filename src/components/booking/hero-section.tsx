interface HeroSectionProps {
  name: string;
  tagline: string | null;
  heroImageUrl: string | null;
  themeColor: string;
}

export function HeroSection({
  name,
  tagline,
  heroImageUrl,
  themeColor,
}: HeroSectionProps) {
  return (
    <section className="relative h-[50vh] min-h-[360px] overflow-hidden sm:h-[60vh]">
      {heroImageUrl && (
        <img
          src={heroImageUrl}
          alt={name}
          className="absolute inset-0 h-full w-full object-cover"
        />
      )}
      <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/30 to-transparent" />
      <div className="absolute bottom-0 left-0 right-0 p-6 sm:p-10">
        <div className="mx-auto max-w-7xl">
          {tagline && (
            <p className="mb-2 text-sm font-medium uppercase tracking-wider text-white/80">
              {tagline}
            </p>
          )}
          <h1 className="text-3xl font-bold text-white sm:text-4xl md:text-5xl">
            {name}
          </h1>
          <div
            className="mt-3 h-1 w-16 rounded-full"
            style={{ backgroundColor: themeColor }}
          />
        </div>
      </div>
    </section>
  );
}
