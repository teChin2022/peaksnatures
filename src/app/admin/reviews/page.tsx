import Link from "next/link";
import { redirect } from "next/navigation";
import { MessageSquare, Star, ThumbsDown } from "lucide-react";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { isAdmin } from "@/lib/admin";
import { fmtBangkokTime } from "@/lib/format-date";
import { Card, CardContent } from "@/components/ui/card";
import { PageHeader } from "@/components/admin/page-header";
import { KpiCard } from "@/components/admin/kpi-card";
import { EmptyState } from "@/components/admin/empty-state";
import { LOW_RATING, REVIEWS_LIMIT, getAdminReviews } from "./data";

const th = "px-4 py-2.5 font-medium";
const td = "px-4 py-2.5 align-top";

export default async function AdminReviewsPage() {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user || !(await isAdmin(user.id))) redirect("/");

  const { reviews, average, low } = await getAdminReviews();

  return (
    <div>
      <PageHeader subtitle="Guest feedback" title="Reviews" />

      <div className="mb-6 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-3">
        <KpiCard label={`Reviews (latest ${REVIEWS_LIMIT})`} value={reviews.length} icon={MessageSquare} tone="earth" />
        <KpiCard label="Average rating" value={average === null ? "—" : `${average.toFixed(1)} / 5`} icon={Star} tone="brand" />
        <KpiCard label={`Rated ${LOW_RATING} or lower`} value={low} icon={ThumbsDown} tone={low > 0 ? "amber" : "neutral"} />
      </div>

      {reviews.length === 0 ? (
        <EmptyState icon={MessageSquare} title="No reviews yet" description="Guest reviews appear here after their stay." />
      ) : (
        <Card className="overflow-hidden border-earth-100 bg-white">
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] text-sm">
                <thead>
                  <tr className="border-b border-earth-100 text-left text-xs text-earth-600">
                    <th scope="col" className={th}>Date</th>
                    <th scope="col" className={th}>Homestay</th>
                    <th scope="col" className={th}>Guest</th>
                    <th scope="col" className={th}>Rating</th>
                    <th scope="col" className={th}>Comment</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-earth-100 text-earth-800">
                  {reviews.map((r) => (
                    <tr key={r.id}>
                      <td className={`${td} whitespace-nowrap tabular-nums`}>{fmtBangkokTime(r.created_at)}</td>
                      <td className={td}>
                        {r.host_id ? (
                          <Link
                            href={`/admin/hosts/${r.host_id}`}
                            className="rounded underline-offset-4 hover:text-brand hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-brand"
                          >
                            {r.homestay_name ?? "Unknown homestay"}
                          </Link>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td className={td}>{r.guest_name}</td>
                      <td className={`${td} whitespace-nowrap tabular-nums ${r.rating <= LOW_RATING ? "font-semibold text-red-700" : ""}`}>
                        {r.rating} / 5
                      </td>
                      <td className={`${td} min-w-64 text-earth-700`}>
                        {r.comment ? <p className="line-clamp-3 whitespace-pre-line">{r.comment}</p> : <span className="text-earth-600">No comment</span>}
                        {(r.photo_count > 0 || r.would_return) && (
                          <p className="mt-1 text-xs text-earth-600">
                            {[r.photo_count > 0 && `${r.photo_count} photo${r.photo_count > 1 ? "s" : ""}`, r.would_return && `Would return: ${r.would_return}`]
                              .filter(Boolean)
                              .join(" · ")}
                          </p>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
