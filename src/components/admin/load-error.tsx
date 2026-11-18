import { CloudOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/admin/empty-state";

/** fetch() threw: nothing reached the server, so the fix is on the admin's side. */
export const NETWORK_ERROR = "Couldn't reach the server. Check your connection and try again.";

/** The route answered with an error but no message of its own. */
export const actionFailed = (what: string) => `Couldn't ${what}. Reload the page and try again.`;

/**
 * A list that failed to load. Without it the page fell through to its empty
 * state ("No hosts found"), which reads as "there are none".
 */
export function LoadError({ what, onRetry }: { what: string; onRetry: () => void }) {
  return (
    <EmptyState
      icon={CloudOff}
      title={`Couldn't load ${what}`}
      description="The server didn't answer. Check your connection, then try again."
      action={
        <Button variant="outline" size="sm" className="cursor-pointer rounded-full border-earth-200" onClick={onRetry}>
          Try again
        </Button>
      }
    />
  );
}
