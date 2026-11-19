import { GuestAiCard } from "@/components/dashboard/guest-ai-card";

/** Owner-only: the middleware sends staff logins away, and /api/host/ai-admin refuses them. */
export default function GuestAiPage() {
  return (
    <div className="mx-auto max-w-2xl">
      <GuestAiCard />
    </div>
  );
}
