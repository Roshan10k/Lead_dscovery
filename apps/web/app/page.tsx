"use client";

import { useState } from "react";
import { AlertTriangle, Radar, Download } from "lucide-react";
import { SearchForm } from "@/components/SearchForm";
import { ResultsTable } from "@/components/ResultsTable";
import { StatusPanel } from "@/components/StatusPanel";
import { StatsBar } from "@/components/StatsBar";
import {
  useCreateSearchMutation,
  useGetSearchStatusQuery,
  useGetSearchResultsQuery,
} from "@/lib/apiSlice";

const IN_PROGRESS_STATUSES = new Set(["pending", "discovering", "scraping", "extracting"]);

const EXAMPLES = [
  { keyword: "Cleaning Business", location: "Australia" },
  { keyword: "Bakery", location: "Toronto" },
  { keyword: "Plumbers", location: "London" },
];

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:4000";

// RTK Query's fetchBaseQuery rejects .unwrap() with either
// { status: <http code>, data: { error: "..." } } for a real API response, or
// { status: "FETCH_ERROR", error: "..." } when the request never reached the
// server at all (API down, CORS, offline). Handle both so a network failure
// doesn't just throw an unhandled rejection with no user-visible feedback.
function extractErrorMessage(err: unknown): string {
  if (err && typeof err === "object") {
    if ("data" in err) {
      const data = (err as { data?: unknown }).data;
      if (data && typeof data === "object" && "error" in data) {
        return String((data as { error: unknown }).error);
      }
    }
    if ("error" in err) {
      return String((err as { error: unknown }).error);
    }
  }
  return "Couldn't reach the server. Make sure the API is running and try again.";
}

export default function Home() {
  const [keyword, setKeyword] = useState("");
  const [location, setLocation] = useState("");
  const [searchId, setSearchId] = useState<string | null>(null);
  const [createError, setCreateError] = useState<string | null>(null);

  const [createSearch, { isLoading: isCreating }] = useCreateSearchMutation();

  const { data: status } = useGetSearchStatusQuery(searchId!, {
    skip: !searchId,
    pollingInterval: 1500,
    skipPollingIfUnfocused: true,
  });

  // Once a search has been started, treat "status not loaded yet" as
  // in-progress too. Otherwise, right after a new searchId is set, `status`
  // is briefly undefined, isInProgress evaluates to false, and the results
  // query fires immediately against a search that just started (0 leads).
  // RTK Query then caches that empty result and never refetches once the
  // search actually completes, since nothing invalidates the "Search" tag on
  // its own — the results table gets stuck empty forever.
  // Gated on `searchId` so this doesn't disable the form before any search
  // has been started (status is also undefined then, since the query is
  // skipped) — otherwise the inputs are permanently disabled on page load.
  const isInProgress = !!searchId && (!status || IN_PROGRESS_STATUSES.has(status.status));

  const { data: resultsData } = useGetSearchResultsQuery(searchId!, {
    skip: !searchId || isInProgress,
  });

  async function handleSearch(nextKeyword: string, nextLocation: string) {
    setCreateError(null);
    setSearchId(null);
    try {
      const res = await createSearch({ keyword: nextKeyword, location: nextLocation }).unwrap();
      setSearchId(res.searchId);
    } catch (err) {
      setCreateError(extractErrorMessage(err));
    }
  }

  function runExample(example: (typeof EXAMPLES)[number]) {
    setKeyword(example.keyword);
    setLocation(example.location);
    handleSearch(example.keyword, example.location);
  }

  const showResults = resultsData && status?.status === "completed";

  return (
    <main className="min-h-screen">
      <div className="border-b border-slate-200 bg-white">
        <div className="mx-auto max-w-4xl px-4 py-10 sm:py-14">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-slate-900">
              <Radar className="h-4.5 w-4.5 text-white" aria-hidden />
            </div>
            <span className="text-sm font-medium text-slate-500">Lead Discovery</span>
          </div>
          <h1 className="mt-4 text-3xl font-semibold tracking-tight text-slate-900 sm:text-4xl">
            Find real businesses from the public web
          </h1>
          <p className="mt-2 max-w-xl text-slate-500">
            Enter a business keyword and a location. We'll discover matching businesses, scrape
            their public pages, and use an LLM to pull out contact details — with a source link
            for every result.
          </p>

          <div className="mt-8">
            <SearchForm
              keyword={keyword}
              location={location}
              onKeywordChange={setKeyword}
              onLocationChange={setLocation}
              onSearch={handleSearch}
              isLoading={isCreating || isInProgress}
            />
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <span className="text-xs text-slate-400">Try:</span>
              {EXAMPLES.map((ex) => (
                <button
                  key={ex.keyword}
                  type="button"
                  onClick={() => runExample(ex)}
                  disabled={isCreating || isInProgress}
                  className="rounded-full border border-slate-200 px-3 py-1 text-xs text-slate-600 transition hover:border-slate-300 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {ex.keyword} · {ex.location}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-4xl px-4 py-8">
        {createError && (
          <div className="flex items-start gap-3 rounded-2xl border border-red-200 bg-red-50 p-4">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-red-500" aria-hidden />
            <div>
              <p className="font-medium text-red-800">Couldn't start search</p>
              <p className="mt-1 text-sm text-red-600">{createError}</p>
            </div>
          </div>
        )}

        {status && <StatusPanel status={status} />}

        {showResults && (
          <div className="mt-6 space-y-6">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-medium text-slate-500">
                Results for <span className="text-slate-900">"{status.keyword}"</span> in{" "}
                <span className="text-slate-900">{status.location}</span>
              </h2>
              <a
                href={`${API_BASE_URL}/api/search/${searchId}/export`}
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-sm text-slate-600 transition hover:border-slate-300 hover:bg-white"
              >
                <Download className="h-3.5 w-3.5" aria-hidden />
                Export CSV
              </a>
            </div>
            <StatsBar leads={resultsData.leads} />
            <ResultsTable leads={resultsData.leads} />
          </div>
        )}
      </div>
    </main>
  );
}
