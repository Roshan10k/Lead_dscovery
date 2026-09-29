import { Check, Globe, FileSearch, Sparkles, AlertTriangle, Loader2, Wand2 } from "lucide-react";
import type { SearchRecord, SearchStatus } from "@/lib/types";

// "Plan" only ever appears for a goal-based search (see StatusPanel below) —
// included in STEP_ORDER regardless so the index math stays correct either way.
const STEPS: { status: SearchStatus; label: string; icon: typeof Globe }[] = [
  { status: "planning", label: "Plan", icon: Wand2 },
  { status: "discovering", label: "Discover", icon: Globe },
  { status: "scraping", label: "Scrape", icon: FileSearch },
  { status: "extracting", label: "Extract", icon: Sparkles },
  { status: "completed", label: "Done", icon: Check },
];

const STEP_ORDER: Record<SearchStatus, number> = {
  pending: -1,
  planning: 0,
  discovering: 1,
  scraping: 2,
  extracting: 3,
  completed: 4,
  failed: -1,
};

export function StatusPanel({ status }: { status: SearchRecord }) {
  if (status.status === "failed") {
    return (
      <div className="mt-6 flex items-start gap-3 rounded-2xl bg-red-950/40 p-4 ring-1 ring-red-500/30">
        <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-red-400" aria-hidden />
        <div>
          <p className="font-medium text-red-300">Search failed</p>
          {status.errorMessage && <p className="mt-1 text-sm text-red-400/80">{status.errorMessage}</p>}
        </div>
      </div>
    );
  }

  // A direct keyword+location search never has a "planning" phase — skip
  // that step entirely rather than showing a step that will never activate.
  const steps = status.goal ? STEPS : STEPS.filter((s) => s.status !== "planning");

  const currentIndex = STEP_ORDER[status.status];
  const progressPct =
    status.candidateCount > 0
      ? Math.min(100, Math.round((status.processedCount / status.candidateCount) * 100))
      : currentIndex >= 0
        ? ((currentIndex + 1) / steps.length) * 100
        : 0;

  return (
    <div className="mt-6 rounded-2xl bg-slate-900/70 p-5 shadow-card ring-1 ring-white/10 backdrop-blur-xl">
      <div className="flex items-center justify-between gap-4">
        {steps.map((step, i) => {
          // Compared against each step's own STEP_ORDER value, not the loop
          // index `i` — those diverge once "planning" is filtered out for a
          // direct search, since e.g. "discovering" is then steps[0] but
          // still STEP_ORDER value 1.
          const stepOrder = STEP_ORDER[step.status];
          const isDone = currentIndex > stepOrder || status.status === "completed";
          const isActive = currentIndex === stepOrder && status.status !== "completed";
          const Icon = step.icon;
          return (
            <div key={step.status} className="flex flex-1 items-center">
              <div className="flex flex-col items-center gap-1.5">
                <div
                  className={`relative flex h-9 w-9 items-center justify-center rounded-xl transition-all ${
                    isDone
                      ? "bg-gradient-to-br from-cyan-500/30 to-cyan-500/10 text-cyan-300 shadow-glow-cyan"
                      : isActive
                        ? "bg-gradient-to-br from-teal-500/30 to-teal-500/10 text-teal-300 shadow-glow-teal"
                        : "bg-slate-800 text-slate-600"
                  }`}
                >
                  {isActive ? (
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                  ) : (
                    <Icon className="h-4 w-4" aria-hidden />
                  )}
                  {isActive && (
                    <span className="absolute -right-0.5 -top-0.5 h-2 w-2 animate-pulse rounded-full bg-teal-400" />
                  )}
                </div>
                <span
                  className={`font-mono text-[10px] uppercase tracking-wider ${
                    isDone ? "text-cyan-300" : isActive ? "text-teal-300" : "text-slate-600"
                  }`}
                >
                  {step.label}
                </span>
              </div>
              {i < steps.length - 1 && (
                <div
                  className={`mx-1 mt-[-18px] h-0.5 flex-1 rounded transition-colors ${
                    isDone ? "bg-cyan-500/50" : "bg-slate-800"
                  }`}
                />
              )}
            </div>
          );
        })}
      </div>

      <div className="mt-5 h-1.5 w-full overflow-hidden rounded-full bg-slate-800">
        <div
          className="h-full rounded-full bg-gradient-to-r from-teal-500 to-cyan-400 transition-all duration-500"
          style={{ width: `${progressPct}%` }}
        />
      </div>
      {status.candidateCount > 0 && (
        <p className="mt-2 text-center font-mono text-[11px] text-slate-500">
          Processed {status.processedCount} / {status.candidateCount} candidate pages
        </p>
      )}

      {!!status.searchSteps?.length && (
        <div className="mt-4 border-t border-white/5 pt-4">
          <p className="font-mono text-[10px] uppercase tracking-wider text-slate-500">
            How the search was planned
          </p>
          <ul className="mt-2 space-y-1.5">
            {status.searchSteps.map((step, i) => {
              const isFinal = i === status.searchSteps!.length - 1;
              return (
                <li key={i} className="flex items-start gap-2 text-xs">
                  <span className={`mt-0.5 h-1.5 w-1.5 shrink-0 rounded-full ${isFinal ? "bg-teal-400" : "bg-slate-700"}`} />
                  <span className="text-slate-400">
                    <span className="text-slate-200">"{step.keyword}"</span> in{" "}
                    <span className="text-slate-200">{step.location}</span> — {step.verdict}
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
