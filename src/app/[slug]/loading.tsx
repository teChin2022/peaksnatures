import { Skeleton } from "@/components/ui/skeleton";

export default function HomestayLandingLoading() {
  return (
    <div className="min-h-screen bg-earth-50">
      {/* Hero skeleton: dark like the hero itself, so loading doesn't flash light to dark */}
      <div className="flex h-[100svh] min-h-[560px] items-center justify-center bg-earth-900">
        <div className="flex w-full max-w-md flex-col items-center gap-4 px-6">
          <Skeleton className="h-12 w-3/4 bg-white/10" />
          <Skeleton className="h-5 w-1/2 bg-white/10" />
        </div>
      </div>

      {/* About skeleton */}
      <div className="mx-auto grid max-w-6xl grid-cols-1 gap-6 px-4 py-20 sm:px-6 md:grid-cols-12 md:gap-12">
        <Skeleton className="h-9 w-48 md:col-span-4" />
        <div className="space-y-3 md:col-span-8">
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-11/12" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-3/4" />
        </div>
      </div>
    </div>
  );
}
