import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { TABLE_CARD } from "@/components/admin/table-classes";

/**
 * Every admin route shares this boundary, and nearly all of them open on a list,
 * so it sketches a title and list rows (the old KPI grid matched only the Overview).
 */
export default function AdminLoading() {
  return (
    <div aria-busy="true" aria-label="Loading">
      <Skeleton className="h-8 w-48" />
      <Skeleton className="mt-2 mb-6 h-3 w-24" />
      <Card className={TABLE_CARD}>
        <div className="divide-y divide-earth-100">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div key={i} className="flex items-start justify-between gap-4 px-4 py-3.5">
              <div className="min-w-0 flex-1 space-y-2">
                <Skeleton className="h-4 w-2/5" />
                <Skeleton className="h-3 w-3/5" />
              </div>
              <Skeleton className="h-4 w-14" />
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
