"use client";

import { useState } from "react";
import { Phone, Mail, ExternalLink, Copy, Check, Inbox, MapPin } from "lucide-react";
import type { Lead } from "@/lib/types";

const AVATAR_COLORS = [
  "bg-rose-100 text-rose-700",
  "bg-amber-100 text-amber-700",
  "bg-emerald-100 text-emerald-700",
  "bg-sky-100 text-sky-700",
  "bg-violet-100 text-violet-700",
  "bg-fuchsia-100 text-fuchsia-700",
];

function avatarColor(name: string) {
  const hash = [...name].reduce((acc, c) => acc + c.charCodeAt(0), 0);
  return AVATAR_COLORS[hash % AVATAR_COLORS.length];
}

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "")).toUpperCase() || "?";
}

function CopyButton({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      title="Copy"
      onClick={async (e) => {
        e.stopPropagation();
        try {
          await navigator.clipboard.writeText(value);
          setCopied(true);
          setTimeout(() => setCopied(false), 1200);
        } catch {
          // Clipboard API can be unavailable (permissions, insecure context) —
          // failing silently is fine here, it's a convenience affordance only.
        }
      }}
      className="rounded p-1 text-slate-300 opacity-0 transition hover:bg-slate-100 hover:text-slate-600 group-hover:opacity-100"
    >
      {copied ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}
    </button>
  );
}

export function ResultsTable({ leads }: { leads: Lead[] }) {
  if (leads.length === 0) {
    return (
      <div className="mt-8 flex flex-col items-center gap-3 rounded-2xl border border-dashed border-slate-200 bg-white py-16 text-center">
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-slate-100">
          <Inbox className="h-5 w-5 text-slate-400" aria-hidden />
        </div>
        <p className="font-medium text-slate-700">No leads found for this search</p>
        <p className="max-w-sm text-sm text-slate-500">
          Try a broader keyword or a larger location — results depend on what's publicly
          discoverable on the web.
        </p>
      </div>
    );
  }

  return (
    <div className="mt-6 overflow-hidden rounded-2xl border border-slate-200 bg-white">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[720px] text-left text-sm">
          <thead className="border-b border-slate-100 bg-slate-50/60 text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-3 font-medium">Business</th>
              <th className="px-4 py-3 font-medium">Location</th>
              <th className="px-4 py-3 font-medium">Contact</th>
              <th className="px-4 py-3 font-medium">Website</th>
              <th className="px-4 py-3 font-medium">Source</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {leads.map((lead) => (
              <tr key={lead.id} className="group align-top transition hover:bg-slate-50/80">
                <td className="px-4 py-3.5">
                  <div className="flex items-start gap-3">
                    <div
                      className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${avatarColor(
                        lead.businessName
                      )}`}
                    >
                      {initials(lead.businessName)}
                    </div>
                    <div className="min-w-0">
                      <p className="max-w-xs truncate font-medium text-slate-900" title={lead.businessName}>
                        {lead.businessName}
                      </p>
                      {lead.description && (
                        <p className="mt-0.5 max-w-xs truncate text-xs text-slate-500" title={lead.description}>
                          {lead.description}
                        </p>
                      )}
                    </div>
                  </div>
                </td>
                <td className="px-4 py-3.5 text-slate-600">
                  {lead.location ? (
                    <span className="flex items-start gap-1.5">
                      <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-400" aria-hidden />
                      <span className="max-w-[220px]">{lead.location}</span>
                    </span>
                  ) : (
                    <span className="text-slate-300">—</span>
                  )}
                </td>
                <td className="px-4 py-3.5">
                  <div className="flex flex-col gap-1.5">
                    {lead.phone ? (
                      <span className="flex items-center gap-1.5 text-slate-600">
                        <Phone className="h-3.5 w-3.5 shrink-0 text-slate-400" aria-hidden />
                        {lead.phone}
                        <CopyButton value={lead.phone} />
                      </span>
                    ) : null}
                    {lead.email ? (
                      <span className="flex items-center gap-1.5 text-slate-600">
                        <Mail className="h-3.5 w-3.5 shrink-0 text-slate-400" aria-hidden />
                        <span className="max-w-[180px] truncate">{lead.email}</span>
                        <CopyButton value={lead.email} />
                      </span>
                    ) : null}
                    {!lead.phone && !lead.email && <span className="text-slate-300">—</span>}
                  </div>
                </td>
                <td className="px-4 py-3.5">
                  {lead.website ? (
                    <a
                      href={lead.website}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 text-blue-600 hover:underline"
                    >
                      Visit <ExternalLink className="h-3 w-3" aria-hidden />
                    </a>
                  ) : (
                    <span className="text-slate-300">—</span>
                  )}
                </td>
                <td className="px-4 py-3.5">
                  <a
                    href={lead.sourceUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 text-slate-400 hover:text-slate-600 hover:underline"
                  >
                    Verify <ExternalLink className="h-3 w-3" aria-hidden />
                  </a>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
