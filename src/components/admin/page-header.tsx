import { cn } from "@/lib/utils";

interface PageHeaderProps {
  subtitle?: string;
  title: string;
  actions?: React.ReactNode;
  className?: string;
}

/** The page title: words only on every admin page (the menu already carries each page's icon). */
export function PageHeader({ subtitle, title, actions, className }: PageHeaderProps) {
  return (
    <div className={cn("mb-6 flex flex-wrap items-end justify-between gap-4", className)}>
      <div className="min-w-0">
        <h1 className="truncate text-2xl leading-tight font-serif text-earth-900">{title}</h1>
        {/* A count or status line under the title (it used to be a tracked kicker above it). */}
        {subtitle && <p className="mt-1 text-xs text-earth-600 tabular-nums">{subtitle}</p>}
      </div>
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </div>
  );
}
