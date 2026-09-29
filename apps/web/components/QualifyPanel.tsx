"use client";

import { useEffect, useState } from "react";
import { Target, Loader2, RotateCw } from "lucide-react";
import {
  useQualifyLeadsMutation,
  useGetQualificationJobQuery,
  useGetQualificationResultsQuery,
} from "@/lib/apiSlice";
import type { LeadQualification } from "@/lib/types";
import { extractErrorMessage } from "@/lib/apiError";

interface Props {
  leadIds: string[];
  onResults: (qualifications: Record<string, LeadQualification>) => void;
}

/**
 * Lets the user describe what they're offering and judges each currently
 * visible lead's fit for it — a reasoning task, not a lookup: whether a
 * business needs a given offering depends on its scraped facts (has a
 * website? an email? social presence?) weighed against what the offering
 * actually is, which isn't reducible to a fixed rule the way e.g. the
 * multi-page email fallback is. See the API's qualifyLeads.ts.
 */
export function QualifyPanel({ leadIds, onResults }: Props) {
  const [offering, setOffering] = useState("");
  const [jobId, setJobId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [qualifyLeads, { isLoading: isStarting }] = useQualifyLeadsMutation();

  // isError distinguishes "a poll genuinely failed" (e.g. the API was
  // briefly unreachable) from "no data yet" — without that distinction, a
  // single failed request looked identical to "still processing" and the
  // button spun forever even once the job had actually completed
  // server-side, since a fetch error never lands in `data`. RTK Query keeps
  // retrying on the next poll tick regardless, so this also self-recovers
  // the moment the API is reachable again — this just stops lying about it
  // in the meantime, and turning the spinner into a "try again" affordance
  // if it doesn't.
  const {
    data: job,
    isError: jobFetchFailed,
  } = useGetQualificationJobQuery(jobId!, {
    skip: !jobId,
    pollingInterval: 1200,
    skipPollingIfUnfocused: true,
  });
  const jobMatchesCurrentJobId = job?.id === jobId;
  const isTerminal = jobMatchesCurrentJobId && (job.status === "completed" || job.status === "failed");
  const isProcessing = !!jobId && !isTerminal && !jobFetchFailed;

  const { data: resultsData } = useGetQualificationResultsQuery(jobId!, {
    skip: !jobId || !jobMatchesCurrentJobId || job?.status !== "completed",
  });

  useEffect(() => {
    if (!resultsData) return;
    const map: Record<string, LeadQualification> = {};
    for (const q of resultsData.qualifications) map[q.leadId] = q;
    onResults(map);
    // onResults identity isn't stable across renders in callers that inline
    // it — only resultsData actually determines when this should re-run.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resultsData]);

  async function handleQualify() {
    setError(null);
    if (!offering.trim() || leadIds.length === 0) return;
    try {
      const res = await qualifyLeads({ offering: offering.trim(), leadIds }).unwrap();
      setJobId(res.jobId);
    } catch (err) {
      setError(extractErrorMessage(err));
    }
  }

  return (
    <div className="flex flex-col gap-2 rounded-2xl bg-slate-900/70 p-4 shadow-card ring-1 ring-white/10 backdrop-blur-xl sm:flex-row sm:items-center">
      <div className="flex flex-1 items-center gap-2.5 rounded-xl bg-slate-800/60 px-3.5 py-2.5">
        <Target className="h-4 w-4 shrink-0 text-teal-400" aria-hidden />
        <input
          value={offering}
          onChange={(e) => setOffering(e.target.value)}
          placeholder="What are you offering? e.g. affordable website design for small businesses"
          disabled={isProcessing}
          className="w-full bg-transparent text-[13px] font-medium text-slate-100 placeholder:text-slate-600 focus:outline-none"
          aria-label="Your offering"
        />
      </div>
      <button
        type="button"
        onClick={handleQualify}
        disabled={isProcessing || isStarting || !offering.trim() || leadIds.length === 0}
        className="flex shrink-0 items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-teal-500 to-cyan-500 px-4 py-2.5 text-[13px] font-semibold text-white shadow-glow-teal transition-all hover:shadow-glow-teal-lg hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40 disabled:shadow-none"
      >
        {isProcessing ? (
          <>
            <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
            Qualifying {job?.processedCount ?? 0}/{job?.totalCount ?? leadIds.length}…
          </>
        ) : (
          <>Qualify {leadIds.length} lead{leadIds.length === 1 ? "" : "s"}</>
        )}
      </button>
      {error && <p className="text-xs text-red-400">{error}</p>}
      {jobFetchFailed && (
        <p className="flex items-center gap-1 text-xs text-amber-400">
          <RotateCw className="h-3 w-3" aria-hidden />
          Lost the connection while checking progress — already-judged leads are cached, so it's cheap to hit Qualify again.
        </p>
      )}
      {jobMatchesCurrentJobId && job.status === "failed" && (
        <p className="text-xs text-red-400">{job.errorMessage ?? "Qualification failed."}</p>
      )}
    </div>
  );
}
