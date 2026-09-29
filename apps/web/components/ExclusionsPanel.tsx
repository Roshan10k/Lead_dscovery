"use client";

import { useRef, useState } from "react";
import { Upload, X, Loader2 } from "lucide-react";
import { useGetExclusionsQuery, useImportExclusionsMutation, useClearExclusionsMutation } from "@/lib/apiSlice";
import { extractErrorMessage } from "@/lib/apiError";

/**
 * Lets a user upload an external list (e.g. a CRM export of businesses
 * they've already contacted) so future searches skip those too — extends
 * the placeId-based dedup (which only knows what this app itself has
 * found) to businesses the user already knows about from elsewhere.
 */
export function ExclusionsPanel() {
  // refetchOnMountOrArgChange: without it, revisiting this tab wouldn't
  // pick up an import/clear done earlier in the session once the initial
  // fetch has already happened once.
  const { data } = useGetExclusionsQuery(undefined, { refetchOnMountOrArgChange: true });
  const [importExclusions, { isLoading: isImporting }] = useImportExclusionsMutation();
  const [clearExclusions] = useClearExclusionsMutation();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [feedback, setFeedback] = useState<string | null>(null);

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // allow re-selecting the same file again later
    if (!file) return;

    const text = await file.text();
    try {
      const res = await importExclusions(text).unwrap();
      setFeedback(`Imported ${res.imported} new domain${res.imported === 1 ? "" : "s"}.`);
    } catch (err) {
      setFeedback(extractErrorMessage(err));
    } finally {
      setTimeout(() => setFeedback(null), 4000);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-3 text-xs text-slate-500">
      <span>
        <span className="text-slate-300">{data?.total ?? 0}</span> businesses excluded from future searches
      </span>

      <input
        ref={fileInputRef}
        type="file"
        accept=".csv,text/csv,text/plain"
        className="hidden"
        onChange={handleFile}
      />
      <button
        type="button"
        onClick={() => fileInputRef.current?.click()}
        disabled={isImporting}
        className="inline-flex items-center gap-1 rounded-md bg-slate-900/70 px-2 py-1 ring-1 ring-white/10 transition hover:text-slate-200 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {isImporting ? (
          <Loader2 className="h-3 w-3 animate-spin" aria-hidden />
        ) : (
          <Upload className="h-3 w-3" aria-hidden />
        )}
        Import CSV
      </button>

      {!!data?.total && (
        <button
          type="button"
          onClick={() => {
            if (window.confirm(`Remove all ${data.total} excluded businesses? They may reappear in future searches.`)) {
              clearExclusions();
            }
          }}
          className="inline-flex items-center gap-1 rounded-md px-2 py-1 transition hover:text-red-400"
        >
          <X className="h-3 w-3" aria-hidden />
          Clear all
        </button>
      )}

      {feedback && <span className="text-teal-400">{feedback}</span>}
    </div>
  );
}
