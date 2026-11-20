import Link from "next/link";
import { redirect } from "next/navigation";
import { MessageSquare, Star, ThumbsDown } from "lucide-react";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { isAdmin } from "@/lib/admin";
import { fmtBangkokTime } from "@/lib/format-date";
import { cn } from "@/lib/utils";
import { Card, CardContent } from "@/components/ui/card";
import { PageHeader } from "@/components/admin/page-header";
import { KpiCard } from "@/components/admin/kpi-card";
import { EmptyState } from "@/components/admin/empty-state";
import { TABLE, TABLE_CARD, TABLE_WRAP, TBODY, TD, TD_LEAD, TD_TRAIL, TH, TH_ROW, TR } from "@/components/admin/table-classes";
import { LOW_RATING, REVIEWS_LIMIT, getAdminReviews } from "./data";


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

      <div className="mb-6 grid grid-cols-3 gap-2 sm:gap-4">
        <KpiCard label={`Reviews (latest ${REVIEWS_LIMIT})`} value={reviews.length} icon={MessageSquare} tone="earth" />
        <KpiCard label="Average rating" value={average === null ? "—" : `${average.toFixed(1)} / 5`} icon={Star} tone="brand" />
        <KpiCard label={`Rated ${LOW_RATING} or lower`} value={low} icon={ThumbsDown} tone={low > 0 ? "amber" : "neutral"} />
      </div>

      {reviews.length === 0 ? (
        <EmptyState icon={MessageSquare} title="No reviews yet" description="Guest reviews appear here after their stay." />
      ) : (
        // Rows on phones (homestay and rating, the comment, then who and when), a table from md.
        <Card className={TABLE_CARD}>
          <CardContent className="p-0">
            <div className={TABLE_WRAP}>
              <table className={cn(TABLE, "md:min-w-[680px]")}>
                <thead>
                  <tr className={TH_ROW}>
                    <th scope="col" className={TH}>Date</th>
                    <th scope="col" className={TH}>Homestay</th>
                    <th scope="col" className={TH}>Guest</th>
                    <th scope="col" className={TH}>Rating</th>
                    <th scope="col" className={TH}>Comment</th>
                  </tr>
                </thead>
                <tbody className={TBODY}>
                  {reviews.map((r) => (
                    <tr key={r.id} className={TR}>
                      <td className={cn(TD, "whitespace-nowrap text-xs tabular-nums text-earth-600 max-md:order-2 md:text-sm md:text-earth-800")}>
                        {fmtBangkokTime(r.created_at)}
                      </td>
                      <td className={cn(TD_LEAD, "max-md:font-semibold max-md:text-earth-900")}>
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
                      <td className={cn(TD, "max-md:order-1 max-md:mt-1 max-md:text-xs max-md:text-earth-600")}>{r.guest_name}</td>
                      <td className={cn(TD_TRAIL, "whitespace-nowrap tabular-nums", r.rating <= LOW_RATING && "font-semibold text-red-700")}>
                        {r.rating} / 5
                      </td>
                      <td className={cn(TD, "text-earth-700 md:min-w-64")}>
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
