"use client";

import { useState } from "react";
import { Search, X } from "lucide-react";

/**
 * Search a list by submitting (Enter or the button), not on every keystroke:
 * each search is a counted query against the whole table.
 */
export function SearchBox({
  value,
  onSearch,
  label,
  placeholder,
}: {
  /** The term the list is filtered by now. */
  value: string;
  onSearch: (term: string) => void;
  label: string;
  placeholder: string;
}) {
  const [draft, setDraft] = useState(value);

  return (
    <form
      role="search"
      onSubmit={(e) => {
        e.preventDefault();
        onSearch(draft.trim());
      }}
      className="flex w-full items-center gap-2 sm:w-96"
    >
      <div className="relative flex-1">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-earth-600" aria-hidden />
        <input
          type="search"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          aria-label={label}
          placeholder={placeholder}
          className="h-10 w-full rounded-full border border-earth-500 bg-white pl-9 pr-9 text-sm text-earth-900 placeholder:text-earth-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 [&::-webkit-search-cancel-button]:hidden"
        />
        {draft && (
          <button
            type="button"
            onClick={() => {
              setDraft("");
              if (value) onSearch("");
            }}
            aria-label="Clear search"
            className="absolute right-1 top-1/2 flex h-8 w-8 -translate-y-1/2 cursor-pointer items-center justify-center rounded-full text-earth-600 hover:bg-earth-50 hover:text-brand focus:outline-none focus-visible:ring-2 focus-visible:ring-brand"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>
      <button
        type="submit"
        className="h-10 shrink-0 cursor-pointer rounded-full bg-brand px-4 text-sm font-medium text-white hover:bg-brand-hover focus:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2"
      >
        Search
      </button>
    </form>
  );
}
