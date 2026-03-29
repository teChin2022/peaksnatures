import { Skeleton } from "@/components/ui/skeleton";

export default function ReviewsLoading() {
  return (
    <div className="min-h-screen bg-gray-50/50">
      {/* Header */}
      <header className="sticky top-0 z-50 border-b bg-white/80 backdrop-blur-md">
        <div className="mx-auto flex h-14 max-w-5xl items-center gap-3 px-4 sm:px-6">
          <Skeleton className="h-4 w-4 rounded" />
          <Skeleton className="h-4 w-32" />
          <div className="ml-auto">
            <Skeleton className="h-4 w-24" />
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 py-8 sm:px-6 space-y-6">
        {/* Rating summary skeleton */}
        <div className="rounded-2xl border border-gray-100 bg-white p-5 sm:p-6 shadow-sm">
          <div className="flex flex-col gap-6 sm:flex-row sm:gap-10">
            <div className="flex flex-col items-center gap-2 sm:min-w-[140px]">
              <Skeleton className="h-14 w-20" />
              <Skeleton className="h-5 w-28" />
              <Skeleton className="h-4 w-16" />
            </div>
            <div className="flex-1 space-y-2">
              <Skeleton className="h-4 w-28 mb-3" />
              {[1, 2, 3, 4, 5].map((i) => (
                <div key={i} className="flex items-center gap-2">
                  <Skeleton className="h-4 w-6" />
                  <Skeleton className="h-2.5 flex-1 rounded-full" />
                  <Skeleton className="h-4 w-8" />
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Sort/filter skeleton */}
        <div className="flex items-center justify-between">
          <div className="flex gap-1.5">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <Skeleton key={i} className="h-8 w-14 rounded-full" />
            ))}
          </div>
          <Skeleton className="h-9 w-[160px] rounded-md" />
        </div>

        {/* Review cards skeleton */}
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="rounded-xl border border-gray-100 bg-white p-5 shadow-sm space-y-3">
              <div className="flex items-start gap-3">
                <Skeleton className="h-10 w-10 rounded-full" />
                <div className="flex-1 space-y-1.5">
                  <Skeleton className="h-4 w-24" />
                  <Skeleton className="h-3 w-16" />
                </div>
                <Skeleton className="h-3 w-20" />
              </div>
              <Skeleton className="h-4 w-40" />
              <Skeleton className="h-4 w-28" />
              <div className="space-y-1.5">
                <Skeleton className="h-3 w-full" />
                <Skeleton className="h-3 w-full" />
                <Skeleton className="h-3 w-3/4" />
              </div>
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}
