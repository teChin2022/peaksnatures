import type { MetadataRoute } from "next";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { isHostBlocked } from "@/lib/plan-expiry";
import { fetchPastDueHostIds } from "@/lib/billing";
import { SITE_URL } from "@/lib/seo";

export const revalidate = 3600;

type HomestayRow = {
  slug: string;
  updated_at: string;
  host_id: string;
};

type HostRow = {
  id: string;
  plan_type: string;
  plan_free_expires_at: string | null;
  wallet_balance: number | null;
  wallet_credit_limit: number | null;
  wallet_negative_since: string | null;
};

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  // No lastModified on static pages: stamping "now" on every regeneration
  // teaches crawlers (Bing feeds ChatGPT search) to ignore lastmod entirely.
  const staticEntries: MetadataRoute.Sitemap = [
    {
      url: `${SITE_URL}/`,
      changeFrequency: "daily",
      priority: 1.0,
      alternates: { languages: { en: `${SITE_URL}/`, th: `${SITE_URL}/` } },
    },
    {
      url: `${SITE_URL}/about`,
      changeFrequency: "monthly",
      priority: 0.5,
      alternates: { languages: { en: `${SITE_URL}/about`, th: `${SITE_URL}/about` } },
    },
    {
      url: `${SITE_URL}/trust-safety`,
      changeFrequency: "monthly",
      priority: 0.4,
      alternates: { languages: { en: `${SITE_URL}/trust-safety`, th: `${SITE_URL}/trust-safety` } },
    },
    {
      url: `${SITE_URL}/host-guidelines`,
      changeFrequency: "monthly",
      priority: 0.4,
      alternates: { languages: { en: `${SITE_URL}/host-guidelines`, th: `${SITE_URL}/host-guidelines` } },
    },
    {
      url: `${SITE_URL}/legal`,
      changeFrequency: "yearly",
      priority: 0.2,
      alternates: { languages: { en: `${SITE_URL}/legal`, th: `${SITE_URL}/legal` } },
    },
  ];

  try {
    const supabase = createServiceRoleClient();

    const { data: homestayRows } = await supabase
      .from("homestays")
      .select("slug, updated_at, host_id")
      .eq("is_active", true);

    const homestays = (homestayRows as HomestayRow[] | null) ?? [];
    if (homestays.length === 0) return staticEntries;

    const hostIds = [...new Set(homestays.map((h) => h.host_id))];
    const [{ data: hostRows }, pastDueHostIds] = await Promise.all([
      supabase
        .from("hosts")
        .select(
          "id, plan_type, plan_free_expires_at, wallet_balance, wallet_credit_limit, wallet_negative_since",
        )
        .in("id", hostIds),
      fetchPastDueHostIds(hostIds, supabase),
    ]);

    const blockedHostIds = new Set<string>();
    for (const host of (hostRows as HostRow[] | null) ?? []) {
      if (
        isHostBlocked({
          plan_type: host.plan_type,
          plan_free_expires_at: host.plan_free_expires_at,
          has_past_due_invoice: pastDueHostIds.has(host.id),
          wallet_balance: host.wallet_balance ?? 0,
          wallet_credit_limit: host.wallet_credit_limit,
          wallet_negative_since: host.wallet_negative_since,
        })
      ) {
        blockedHostIds.add(host.id);
      }
    }

    // /[slug]/reviews is only the write-a-review form (noindex), so it is not listed.
    const homestayEntries: MetadataRoute.Sitemap = homestays
      .filter((h) => !blockedHostIds.has(h.host_id))
      .map((h) => {
        const slugUrl = `${SITE_URL}/${h.slug}`;
        return {
          url: slugUrl,
          lastModified: new Date(h.updated_at),
          changeFrequency: "weekly" as const,
          priority: 0.9,
          alternates: { languages: { en: slugUrl, th: slugUrl } },
        };
      });

    return [...staticEntries, ...homestayEntries];
  } catch {
    return staticEntries;
  }
}
