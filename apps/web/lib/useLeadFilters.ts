import { useMemo, useState } from "react";
import type { Lead } from "./types";

/** Shared "Has email" / "New only" filters + A-Z sort, used by the search results, group detail, and All Leads views. */
export function useLeadFilters(leads: Lead[]) {
  const [emailOnly, setEmailOnly] = useState(false);
  const [newOnly, setNewOnly] = useState(false);
  const [sortAZ, setSortAZ] = useState(false);

  const visibleLeads = useMemo(() => {
    let filtered = emailOnly ? leads.filter((l) => l.email) : leads;
    if (newOnly) filtered = filtered.filter((l) => l.outreachStatus === "new");
    if (!sortAZ) return filtered;
    return [...filtered].sort((a, b) => a.businessName.localeCompare(b.businessName));
  }, [leads, emailOnly, newOnly, sortAZ]);

  return { visibleLeads, emailOnly, setEmailOnly, newOnly, setNewOnly, sortAZ, setSortAZ };
}
