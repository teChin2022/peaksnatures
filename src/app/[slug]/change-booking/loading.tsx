import { Skeleton } from "@/components/ui/skeleton";

export default function ChangeBookingLoading() {
  return (
    <div className="flex min-h-screen flex-col bg-earth-50">
      <header className="sticky top-0 z-30 border-b border-earth-200 bg-earth-50/80 backdrop-blur-sm">
        <div className="mx-auto flex h-14 max-w-2xl items-center px-4">
          <Skeleton className="h-4 w-16 rounded" />
        </div>
      </header>
      <main className="flex-1 px-4 py-10 md:py-14">
        <div className="mx-auto max-w-2xl space-y-8">
          <div className="flex flex-col items-center gap-3">
            <Skeleton className="h-5 w-20 rounded-full" />
            <Skeleton className="h-9 w-56 md:h-10" />
            <Skeleton className="h-4 w-64" />
          </div>
          <div className="flex gap-2">
            <Skeleton className="h-12 flex-1 rounded-xl" />
            <Skeleton className="h-12 w-24 rounded-full" />
          </div>
        </div>
      </main>
    </div>
  );
}
