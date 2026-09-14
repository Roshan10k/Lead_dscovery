"use client";

import { Search, MapPin, Loader2 } from "lucide-react";

interface Props {
  keyword: string;
  location: string;
  onKeywordChange: (value: string) => void;
  onLocationChange: (value: string) => void;
  onSearch: (keyword: string, location: string) => void;
  isLoading: boolean;
}

export function SearchForm({
  keyword,
  location,
  onKeywordChange,
  onLocationChange,
  onSearch,
  isLoading,
}: Props) {
  return (
    <form
      className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm sm:flex-row sm:items-center sm:gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        if (keyword.trim() && location.trim()) onSearch(keyword.trim(), location.trim());
      }}
    >
      <div className="flex flex-1 items-center gap-2 rounded-xl border border-transparent px-3 py-2 focus-within:border-slate-300 sm:border-r sm:border-slate-200 sm:pr-4">
        <Search className="h-4 w-4 shrink-0 text-slate-400" aria-hidden />
        <input
          className="w-full bg-transparent text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none"
          placeholder="Keyword, e.g. Cleaning Business"
          value={keyword}
          onChange={(e) => onKeywordChange(e.target.value)}
          disabled={isLoading}
          aria-label="Business keyword"
        />
      </div>
      <div className="flex flex-1 items-center gap-2 rounded-xl border border-transparent px-3 py-2 focus-within:border-slate-300">
        <MapPin className="h-4 w-4 shrink-0 text-slate-400" aria-hidden />
        <input
          className="w-full bg-transparent text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none"
          placeholder="Location, e.g. Australia"
          value={location}
          onChange={(e) => onLocationChange(e.target.value)}
          disabled={isLoading}
          aria-label="Location"
        />
      </div>
      <button
        type="submit"
        disabled={isLoading || !keyword.trim() || !location.trim()}
        className="flex items-center justify-center gap-2 rounded-xl bg-slate-900 px-6 py-3 text-sm font-medium text-white transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-50 sm:py-2.5"
      >
        {isLoading ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            Searching…
          </>
        ) : (
          <>
            <Search className="h-4 w-4" aria-hidden />
            Search
          </>
        )}
      </button>
    </form>
  );
}
