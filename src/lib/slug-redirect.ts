import { createServiceRoleClient } from "@/lib/supabase/server";

export async function resolveSlugRedirect(slug: string): Promise<string | null> {
  const supabase = createServiceRoleClient();
  const { data } = await supabase
    .from("homestay_slug_redirects" as never)
    .select("homestay_id")
    .eq("old_slug", slug)
    .single();
  if (!data) return null;
  const homestayId = (data as unknown as { homestay_id: string }).homestay_id;
  const { data: homestay } = await supabase
    .from("homestays")
    .select("slug")
    .eq("id", homestayId)
    .eq("is_active", true)
    .single();
  return (homestay as unknown as { slug: string } | null)?.slug || null;
}
