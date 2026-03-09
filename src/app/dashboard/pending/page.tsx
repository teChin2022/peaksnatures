"use client";

import { useRouter } from "next/navigation";
import { Clock, LogOut } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";
import { logClientEvent } from "@/lib/history-log-client";

export default function PendingApprovalPage() {
  const router = useRouter();

  const handleSignOut = async () => {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    await logClientEvent({ entity_type: "host", entity_id: user?.id || "unknown", event_type: "HOST_LOGOUT", data: { email: user?.email } });
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-md">
        <Card>
          <CardContent className="flex flex-col items-center gap-6 py-12 px-6 text-center">
            <div className="flex h-20 w-20 items-center justify-center rounded-full bg-amber-100">
              <Clock className="h-10 w-10 text-amber-600" />
            </div>

            <div className="space-y-2">
              <h1 className="text-2xl font-bold text-gray-900">
                รอการอนุมัติ
              </h1>
              <p className="text-base text-gray-500">
                Account Pending Approval
              </p>
            </div>

            <div className="space-y-3 text-sm text-gray-600">
              <p>
                บัญชีของคุณกำลังรอการตรวจสอบจากทีมงาน เราจะแจ้งผลให้ทราบทางอีเมลเมื่อได้รับการอนุมัติ
              </p>
              <p className="text-gray-400">
                Your account is being reviewed by our team. We&apos;ll notify you by email once approved.
              </p>
            </div>

            <Button
              variant="outline"
              onClick={handleSignOut}
              className="mt-4 gap-2"
            >
              <LogOut className="h-4 w-4" />
              ออกจากระบบ / Sign Out
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
