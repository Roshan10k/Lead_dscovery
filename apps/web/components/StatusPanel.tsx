import { Check, Globe, FileSearch, Sparkles, AlertTriangle, Loader2 } from "lucide-react";
import type { SearchRecord, SearchStatus } from "@/lib/types";

const STEPS: { status: SearchStatus; label: string; icon: typeof Globe }[] = [
  { status: "discovering", label: "Discover", icon: Globe },
  { status: "scraping", label: "Scrape", icon: FileSearch },
  { status: "extracting", label: "Extract", icon: Sparkles },
  { status: "completed", label: "Done", icon: Check },
];

const STEP_ORDER: Record<SearchStatus, number> = {
  pending: -1,
  discovering: 0,
  scraping: 1,
  extracting: 2,
  completed: 3,
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

  const currentIndex = STEP_ORDER[status.status];
  const progressPct =
    status.candidateCount > 0
      ? Math.min(100, Math.round((status.processedCount / status.candidateCount) * 100))
      : currentIndex >= 0
        ? ((currentIndex + 1) / STEPS.length) * 100
        : 0;

  return (
    <div className="mt-6 rounded-2xl bg-slate-900/70 p-5 shadow-card ring-1 ring-white/10 backdrop-blur-xl">
      <div className="flex items-center justify-between gap-4">
        {STEPS.map((step, i) => {
          const isDone = currentIndex > i || status.status === "completed";
          const isActive = currentIndex === i && status.status !== "completed";
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
              {i < STEPS.length - 1 && (
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
    </div>
  );
}
