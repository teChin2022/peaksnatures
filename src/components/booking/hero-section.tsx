import Image from "next/image";

interface HeroSectionProps {
  name: string;
  tagline: string | null;
  heroImageUrl: string | null;
}

/** Photo header of /[slug]/book: the name and tagline, centred and still, so nothing moves while the guest picks dates. */
export function HeroSection({ name, tagline, heroImageUrl }: HeroSectionProps) {
  return (
    <section className="relative h-[42svh] min-h-[320px] w-full overflow-hidden bg-pine-deep md:h-[50vh] md:min-h-[400px]">
      {heroImageUrl && (
        <Image src={heroImageUrl} alt={name} fill sizes="100vw" priority quality={85} className="object-cover object-center" />
      )}
      {/* Flat, as on /[slug]: the centred text gets the same shade wherever the photo is bright. */}
      <div className="absolute inset-0 bg-black/55" />

      {/* pt-16 clears the header over the photo; the bottom padding the date panel overlapping the bottom edge. */}
      <div className="absolute inset-0 flex items-center justify-center px-6 pt-16 pb-8 md:pb-12">
        <div className="max-w-4xl text-center text-white text-shadow-lg text-shadow-black/40">
          <h1 className="font-serif text-3xl leading-tight text-balance sm:text-4xl md:text-5xl">{name}</h1>
          {tagline && <p className="mt-3 font-serif text-base text-white/90 sm:text-lg">{tagline}</p>}
        </div>
      </div>
    </section>
  );
}
