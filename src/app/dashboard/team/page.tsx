import { StaffCard } from "@/components/dashboard/staff-card";

/** Owner-only: the middleware sends staff logins away, and /api/host/staff refuses them. */
export default function TeamPage() {
  return (
    <div className="mx-auto max-w-2xl">
      <StaffCard />
    </div>
  );
}
