import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

interface PageHeaderProps {
  eyebrow?: string;
  title: string;
  icon?: LucideIcon;
  actions?: React.ReactNode;
  className?: string;
}

export function PageHeader({ eyebrow, title, icon: Icon, actions, className }: PageHeaderProps) {
  return (
    <div className={cn("mb-6 flex items-end justify-between gap-4", className)}>
      <div className="min-w-0">
        {eyebrow && (
          <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-earth-500 mb-1.5">
            {eyebrow}
          </p>
        )}
        <div className="flex items-center gap-3">
          {Icon && (
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand-50 ring-1 ring-inset ring-brand/10">
              <Icon className="h-4.5 w-4.5 text-brand" />
            </div>
          )}
          <h1 className="text-2xl font-serif text-earth-900 leading-tight truncate">{title}</h1>
        </div>
      </div>
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </div>
  );
}
