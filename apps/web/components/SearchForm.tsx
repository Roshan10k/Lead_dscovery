"use client";

import { Search, MapPin, Loader2, ArrowRight } from "lucide-react";

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
      className="flex flex-col gap-1.5 rounded-2xl bg-slate-900/80 p-1.5 shadow-card ring-1 ring-white/10 backdrop-blur-xl transition-shadow duration-300 focus-within:shadow-glow-teal-lg sm:flex-row sm:items-center"
      onSubmit={(e) => {
        e.preventDefault();
        if (keyword.trim() && location.trim()) onSearch(keyword.trim(), location.trim());
      }}
    >
      <div className="flex flex-1 items-center gap-2.5 rounded-xl bg-slate-800/60 px-4 py-3 transition-colors hover:bg-slate-800">
        <Search className="h-[18px] w-[18px] shrink-0 text-teal-400" aria-hidden />
        <div className="flex min-w-0 flex-1 flex-col text-left">
          <span className="font-mono text-[10px] uppercase tracking-wider text-slate-500">
            Target keyword
          </span>
          <input
            className="w-full bg-transparent text-[15px] font-medium text-slate-100 placeholder:text-slate-600 focus:outline-none"
            placeholder="e.g. Cleaning Business"
            value={keyword}
            onChange={(e) => onKeywordChange(e.target.value)}
            disabled={isLoading}
            aria-label="Business keyword"
          />
        </div>
      </div>

      <div className="hidden h-8 w-px shrink-0 bg-slate-700/60 sm:block" />

      <div className="flex flex-1 items-center gap-2.5 rounded-xl bg-slate-800/60 px-4 py-3 transition-colors hover:bg-slate-800">
        <MapPin className="h-[18px] w-[18px] shrink-0 text-cyan-400" aria-hidden />
        <div className="flex min-w-0 flex-1 flex-col text-left">
          <span className="font-mono text-[10px] uppercase tracking-wider text-slate-500">
            Location
          </span>
          <input
            className="w-full bg-transparent text-[15px] font-medium text-slate-100 placeholder:text-slate-600 focus:outline-none"
            placeholder="e.g. Australia"
            value={location}
            onChange={(e) => onLocationChange(e.target.value)}
            disabled={isLoading}
            aria-label="Location"
          />
        </div>
      </div>

      <button
        type="submit"
        disabled={isLoading || !keyword.trim() || !location.trim()}
        className="flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-teal-500 to-cyan-500 px-6 py-3.5 text-sm font-semibold text-white shadow-glow-teal transition-all hover:shadow-glow-teal-lg hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40 disabled:shadow-none sm:py-3"
      >
        {isLoading ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            Searching…
          </>
        ) : (
          <>
            Search
            <ArrowRight className="h-4 w-4" aria-hidden />
          </>
        )}
      </button>
    </form>
  );
}
