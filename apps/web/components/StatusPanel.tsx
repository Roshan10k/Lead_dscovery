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
      <div className="mt-6 flex items-start gap-3 rounded-2xl border border-red-200 bg-red-50 p-4">
        <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-red-500" aria-hidden />
        <div>
          <p className="font-medium text-red-800">Search failed</p>
          {status.errorMessage && <p className="mt-1 text-sm text-red-600">{status.errorMessage}</p>}
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
    <div className="mt-6 rounded-2xl border border-slate-200 bg-white p-5">
      <div className="flex items-center justify-between gap-4">
        {STEPS.map((step, i) => {
          const isDone = currentIndex > i || status.status === "completed";
          const isActive = currentIndex === i && status.status !== "completed";
          const Icon = step.icon;
          return (
            <div key={step.status} className="flex flex-1 items-center">
              <div className="flex flex-col items-center gap-1.5">
                <div
                  className={`flex h-9 w-9 items-center justify-center rounded-full border-2 transition-colors ${
                    isDone
                      ? "border-slate-900 bg-slate-900 text-white"
                      : isActive
                        ? "border-slate-900 bg-white text-slate-900"
                        : "border-slate-200 bg-white text-slate-300"
                  }`}
                >
                  {isActive ? (
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                  ) : (
                    <Icon className="h-4 w-4" aria-hidden />
                  )}
                </div>
                <span
                  className={`text-xs font-medium ${
                    isDone || isActive ? "text-slate-900" : "text-slate-400"
                  }`}
                >
                  {step.label}
                </span>
              </div>
              {i < STEPS.length - 1 && (
                <div
                  className={`mx-1 mt-[-18px] h-0.5 flex-1 rounded transition-colors ${
                    isDone ? "bg-slate-900" : "bg-slate-200"
                  }`}
                />
              )}
            </div>
          );
        })}
      </div>

      <div className="mt-5 h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
        <div
          className="h-full rounded-full bg-slate-900 transition-all duration-500"
          style={{ width: `${progressPct}%` }}
        />
      </div>
      {status.candidateCount > 0 && (
        <p className="mt-2 text-center text-xs text-slate-500">
          Processed {status.processedCount} / {status.candidateCount} candidate pages
        </p>
      )}
    </div>
  );
}
