import type { MetadataRoute } from "next";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { isHostBlocked } from "@/lib/plan-expiry";
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
  const now = new Date();

  const staticEntries: MetadataRoute.Sitemap = [
    {
      url: `${SITE_URL}/`,
      lastModified: now,
      changeFrequency: "daily",
      priority: 1.0,
      alternates: { languages: { en: `${SITE_URL}/`, th: `${SITE_URL}/` } },
    },
    {
      url: `${SITE_URL}/about`,
      lastModified: now,
      changeFrequency: "monthly",
      priority: 0.5,
      alternates: { languages: { en: `${SITE_URL}/about`, th: `${SITE_URL}/about` } },
    },
    {
      url: `${SITE_URL}/trust-safety`,
      lastModified: now,
      changeFrequency: "monthly",
      priority: 0.4,
      alternates: { languages: { en: `${SITE_URL}/trust-safety`, th: `${SITE_URL}/trust-safety` } },
    },
    {
      url: `${SITE_URL}/host-guidelines`,
      lastModified: now,
      changeFrequency: "monthly",
      priority: 0.4,
      alternates: { languages: { en: `${SITE_URL}/host-guidelines`, th: `${SITE_URL}/host-guidelines` } },
    },
    {
      url: `${SITE_URL}/legal`,
      lastModified: now,
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
    const [{ data: hostRows }, { data: overdueRows }] = await Promise.all([
      supabase
        .from("hosts")
        .select(
          "id, plan_type, plan_free_expires_at, wallet_balance, wallet_credit_limit, wallet_negative_since",
        )
        .in("id", hostIds),
      supabase.from("invoices").select("host_id").in("host_id", hostIds).eq("status", "overdue"),
    ]);

    const overdueHostIds = new Set<string>(
      ((overdueRows as { host_id: string }[] | null) ?? []).map((r) => r.host_id),
    );
    const blockedHostIds = new Set<string>();
    for (const host of (hostRows as HostRow[] | null) ?? []) {
      if (
        isHostBlocked({
          plan_type: host.plan_type,
          plan_free_expires_at: host.plan_free_expires_at,
          has_overdue_invoice: overdueHostIds.has(host.id),
          wallet_balance: host.wallet_balance ?? 0,
          wallet_credit_limit: host.wallet_credit_limit,
          wallet_negative_since: host.wallet_negative_since,
        })
      ) {
        blockedHostIds.add(host.id);
      }
    }

    const homestayEntries: MetadataRoute.Sitemap = homestays
      .filter((h) => !blockedHostIds.has(h.host_id))
      .flatMap((h) => {
        const slugUrl = `${SITE_URL}/${h.slug}`;
        const reviewsUrl = `${SITE_URL}/${h.slug}/reviews`;
        const lastModified = new Date(h.updated_at);
        return [
          {
            url: slugUrl,
            lastModified,
            changeFrequency: "weekly" as const,
            priority: 0.9,
            alternates: { languages: { en: slugUrl, th: slugUrl } },
          },
          {
            url: reviewsUrl,
            lastModified,
            changeFrequency: "weekly" as const,
            priority: 0.5,
            alternates: { languages: { en: reviewsUrl, th: reviewsUrl } },
          },
        ];
      });

    return [...staticEntries, ...homestayEntries];
  } catch {
    return staticEntries;
  }
}
