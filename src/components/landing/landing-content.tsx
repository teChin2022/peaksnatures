"use client";

import { useState } from "react";
import type { LandingStat } from "@/lib/landing-stats";
import { LandingHero } from "./hero";
import { LandingStats } from "./stats";
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

export function LandingContent({ homestays, stats }: { homestays: HomestayData[]; stats: LandingStat[] }) {
  const [query, setQuery] = useState("");
  const [locationFilter, setLocationFilter] = useState("");

  return (
    <>
      <LandingHero query={query} onQueryChange={setQuery} onSearch={setLocationFilter} />
      <UniqueHomestays
        homestays={homestays}
        locationFilter={locationFilter}
        onClearFilter={() => {
          setQuery("");
          setLocationFilter("");
        }}
      />
      <LandingStats stats={stats} />
      <WhyPeaksnature />
      <ForHosts />
    </>
  );
}
