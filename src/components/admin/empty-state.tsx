import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

interface EmptyStateProps {
  icon?: LucideIcon;
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
}

export function EmptyState({ icon: Icon, title, description, action, className }: EmptyStateProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center rounded-xl border border-dashed border-earth-200 bg-white px-6 py-12 text-center",
        className
      )}
    >
      {Icon && (
        <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-earth-50 ring-1 ring-inset ring-earth-100">
          <Icon className="h-5 w-5 text-earth-500" />
        </div>
      )}
      <p className="font-serif text-base text-earth-900">{title}</p>
      {description && <p className="mt-1 max-w-sm text-sm text-earth-500">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
