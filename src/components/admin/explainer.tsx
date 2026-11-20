import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * A page's "how this works" copy: always shown from md, one tap away on phones
 * so the list comes first (mobile first, 2026-11-20). No JS: native <details>.
 */
export function Explainer({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("mb-5 max-w-md text-sm text-earth-600", className)}>
      <details className="group md:hidden">
        <summary className="flex min-h-11 w-fit cursor-pointer list-none items-center gap-1.5 rounded font-medium text-earth-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand [&::-webkit-details-marker]:hidden">
          How this works
          <ChevronDown className="h-4 w-4 transition-transform duration-200 group-open:rotate-180 motion-reduce:transition-none" aria-hidden />
        </summary>
        <div className="pb-2">{children}</div>
      </details>
      <div className="hidden md:block">{children}</div>
    </div>
  );
}
