import type { ReactNode } from "react";

export interface Feature {
  icon: ReactNode;
  title: string;
  description: string;
}

/** The icon + title + line rows of the "why" and host sections: one pattern, so the two can't drift apart. */
export function FeatureList({ items }: { items: Feature[] }) {
  return (
    <ul>
      {items.map((item, idx) => (
        <li
          key={item.title}
          className={`flex items-start gap-5 py-6 ${idx < items.length - 1 ? "border-b border-earth-200" : ""}`}
        >
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-brand-50">{item.icon}</div>
          <div>
            <h3 className="mb-1 text-base font-semibold text-earth-900">{item.title}</h3>
            <p className="text-sm leading-relaxed text-earth-600">{item.description}</p>
          </div>
        </li>
      ))}
    </ul>
  );
}
