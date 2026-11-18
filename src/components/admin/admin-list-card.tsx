"use client";

import { useEffect, useState } from "react";
import { ShieldCheck } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusBadge } from "@/components/admin/status-badge";
import { fmtDate } from "@/lib/format-date";
import type { AdminListItem } from "@/app/api/admin/admins/route";

const when = (iso: string) => fmtDate(new Date(iso), "MMM d, yyyy · HH:mm", "en");

/** Read-only: who can open /admin. Adding or removing an admin stays in the Supabase SQL editor. */
export function AdminListCard() {
  const [admins, setAdmins] = useState<AdminListItem[] | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    fetch("/api/admin/admins")
      .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
      .then((res: { data: AdminListItem[] }) => setAdmins(res.data))
      .catch(() => setFailed(true));
  }, []);

  return (
    <Card className="mt-6 border-earth-100">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base font-serif text-earth-900">
          <ShieldCheck className="h-4 w-4 text-brand" />
          Platform admins
        </CardTitle>
        <CardDescription className="text-earth-500">
          Everyone who can open this admin area. Admins are added or removed in the Supabase SQL editor.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {failed ? (
          <p className="text-sm text-red-700">Could not load the admin list. Reload to try again.</p>
        ) : admins === null ? (
          <Skeleton className="h-16 w-full" />
        ) : (
          <ul className="divide-y divide-earth-100">
            {admins.map((a) => (
              <li key={a.id} className="flex flex-wrap items-start justify-between gap-x-4 gap-y-1 py-3 text-sm">
                <div className="min-w-0">
                  <p className="font-medium text-earth-900">{a.name}</p>
                  <p className="break-all text-earth-600">{a.email}</p>
                </div>
                <div className="text-right text-xs text-earth-500">
                  <StatusBadge
                    status={a.line_alerts ? "active" : "inactive"}
                    label={a.line_alerts ? "LINE alerts on" : "No LINE alerts"}
                  />
                  <p className="mt-1">Last login {a.last_login_at ? when(a.last_login_at) : "not recorded"}</p>
                  <p>Added {when(a.created_at)}</p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
