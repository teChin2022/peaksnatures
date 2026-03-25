"use client";

import { useState } from "react";
import { LandingHero } from "./hero";
import { WhyPeaksnature } from "./why-peaksnature";
import { UniqueHomestays } from "./unique-homestays";
import { ForHosts } from "./for-hosts";

interface HomestayData {
  slug: string;
  name: string;
  location: string;
  hero_image_url: string | null;
  gallery: string[];
  min_price: number | null;
  max_guests: number;
  tagline: string | null;
  review_count: number;
  average_rating: number;
  is_host_verified: boolean;
}

export function LandingContent({ homestays }: { homestays: HomestayData[] }) {
  const [locationFilter, setLocationFilter] = useState("");

  return (
    <>
      <LandingHero onSearch={(loc) => setLocationFilter(loc)} />
      <WhyPeaksnature />
      <UniqueHomestays homestays={homestays} locationFilter={locationFilter} />
      <ForHosts />
    </>
  );
}
