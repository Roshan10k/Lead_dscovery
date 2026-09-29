"use client";

import { useState } from "react";
import { Loader2, ChevronRight, Search } from "lucide-react";
import { useGetLeadGroupsQuery } from "@/lib/apiSlice";
import { ExclusionsPanel } from "./ExclusionsPanel";

interface Props {
  onSelectGroup: (group: { keyword: string; location: string }) => void;
}

// The backend's `mostRecentAt` comes straight from Postgres as
// "YYYY-MM-DD HH:MM:SS.ffffff+00" — a space separator and a bare 2-digit
// offset. JS's Date constructor requires a "T" separator and a full
// "+00:00"-style offset (or "Z"); without normalizing both, this silently
// produces an Invalid Date rather than throwing, which is why the date just
// didn't render — no error, just nothing (or "Invalid Date" from
// toLocaleDateString on the fallback branch).
function toIsoString(pgTimestamp: string): string {
  let s = pgTimestamp.replace(" ", "T");
  if (/[+-]\d{2}$/.test(s)) {
    s += ":00";
  } else if (!/Z$|[+-]\d{2}:\d{2}$/.test(s)) {
    s += "Z";
  }
  return s;
}

function formatRelativeDate(pgTimestamp: string): string {
  const date = new Date(toIsoString(pgTimestamp));
  if (isNaN(date.getTime())) return "recently";
  const days = Math.floor((Date.now() - date.getTime()) / 86_400_000);
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 30) return `${days}d ago`;
  return date.toLocaleDateString();
}

export function LeadGroupsList({ onSelectGroup }: Props) {
  // refetchOnMountOrArgChange: without it, switching into this tab would
  // just keep showing whatever group list was last fetched in this session,
  // stale the moment a new search adds a new group or grows an existing one.
  const { data, isFetching } = useGetLeadGroupsQuery(undefined, { refetchOnMountOrArgChange: true });
  const [query, setQuery] = useState("");

  if (!data && isFetching) {
    return (
      <div className="flex items-center justify-center gap-2 py-24 text-slate-500">
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
        Loading your collected leads…
      </div>
    );
  }

  if (data && data.groups.length === 0) {
    return (
      <div className="py-24 text-center">
        <p className="font-medium text-slate-300">No leads collected yet</p>
        <p className="mt-1 text-sm text-slate-500">Run a search to start building your list.</p>
      </div>
    );
  }

  const totalLeads = data?.groups.reduce((sum, g) => sum + g.leadCount, 0) ?? 0;
  const normalizedQuery = query.trim().toLowerCase();
  const filteredGroups = data?.groups.filter(
    (g) =>
      !normalizedQuery ||
      g.keyword.toLowerCase().includes(normalizedQuery) ||
      g.location.toLowerCase().includes(normalizedQuery)
  );

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-slate-100">Your Lead Collection</h1>
          <h2 className="mt-1 text-sm font-medium text-slate-500">
            <span className="text-slate-200">{totalLeads}</span> leads across{" "}
            <span className="text-slate-200">{data?.groups.length ?? 0}</span> searches
          </h2>
        </div>
        {data && data.groups.length > 5 && (
          <div className="flex items-center gap-2 rounded-lg bg-slate-900/70 px-3 py-2 ring-1 ring-white/10">
            <Search className="h-3.5 w-3.5 shrink-0 text-slate-500" aria-hidden />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search searches…"
              className="w-40 bg-transparent text-sm text-slate-200 placeholder:text-slate-600 focus:outline-none"
            />
          </div>
        )}
      </div>

      <div className="mt-3">
        <ExclusionsPanel />
      </div>

      {filteredGroups?.length === 0 && (
        <p className="mt-6 text-sm text-slate-500">No searches match "{query}".</p>
      )}

      <div className="mt-4 flex flex-col gap-2">
        {filteredGroups?.map((group) => (
          <button
            key={`${group.keyword}::${group.location}`}
            type="button"
            onClick={() => onSelectGroup(group)}
            className="group flex items-center justify-between rounded-2xl bg-slate-900/70 px-5 py-4 text-left shadow-card ring-1 ring-white/10 backdrop-blur-xl transition hover:bg-slate-900/90 hover:ring-teal-400/30"
          >
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-slate-800 text-teal-400">
                <Search className="h-4 w-4" aria-hidden />
              </div>
              <div>
                <p className="font-medium text-slate-100">
                  {group.keyword} <span className="text-slate-500">·</span> {group.location}
                </p>
                <p className="mt-0.5 text-xs text-slate-500">
                  {group.leadCount} lead{group.leadCount === 1 ? "" : "s"} · last found{" "}
                  {formatRelativeDate(group.mostRecentAt)}
                </p>
              </div>
            </div>
            <ChevronRight
              className="h-4 w-4 shrink-0 text-slate-600 transition group-hover:translate-x-0.5 group-hover:text-slate-400"
              aria-hidden
            />
          </button>
        ))}
      </div>
    </div>
  );
}
