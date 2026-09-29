import { createApi, fetchBaseQuery } from "@reduxjs/toolkit/query/react";
import type { SearchRecord, Lead, LeadGroup, OutreachStatus } from "./types";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:4000";

export const api = createApi({
  reducerPath: "api",
  baseQuery: fetchBaseQuery({ baseUrl: API_BASE_URL }),
  tagTypes: ["Search", "Exclusions"],
  endpoints: (builder) => ({
    createSearch: builder.mutation<{ searchId: string }, { keyword: string; location: string } | { goal: string }>({
      query: (body) => ({ url: "/api/search", method: "POST", body }),
    }),
    getSearchStatus: builder.query<SearchRecord, string>({
      query: (id) => `/api/search/${id}`,
      providesTags: (_result, _err, id) => [{ type: "Search", id }],
    }),
    getSearchResults: builder.query<{ search: SearchRecord; leads: Lead[] }, string>({
      query: (id) => `/api/search/${id}/results`,
      providesTags: (_result, _err, id) => [{ type: "Search", id }],
    }),
    // Distinct (keyword, location) groups across all accumulated leads —
    // powers the "All Leads" tab's group list. Same staleness caveat as
    // getAllLeads below: pass `refetchOnMountOrArgChange: true`.
    getLeadGroups: builder.query<{ groups: LeadGroup[] }, void>({
      query: () => "/api/leads/groups",
      providesTags: ["Search"],
    }),
    // Every lead ever collected, optionally scoped to one (keyword, location)
    // group. Callers should pass `refetchOnMountOrArgChange: true` (see
    // page.tsx) so this always reflects what's actually in the database now
    // — the query args don't change between polls of the same view, so
    // without that option RTK Query would just keep showing a stale cached
    // result from earlier in the session rather than picking up leads from
    // searches run since.
    getAllLeads: builder.query<{ leads: Lead[]; total: number }, { limit: number; keyword?: string; location?: string }>(
      {
        query: ({ limit, keyword, location }) => {
          const params = new URLSearchParams({ limit: String(limit) });
          if (keyword && location) {
            params.set("keyword", keyword);
            params.set("location", location);
          }
          return `/api/leads?${params.toString()}`;
        },
        providesTags: ["Search"],
      }
    ),
    // Outreach status / notes — invalidates every "Search"-tagged query so
    // whichever view is currently open (a single search's results, a
    // group's leads, or the groups list itself) reflects the change rather
    // than showing a stale outreachStatus until the next unrelated refetch.
    updateLead: builder.mutation<Lead, { id: string; outreachStatus?: OutreachStatus; notes?: string | null }>({
      query: ({ id, ...body }) => ({ url: `/api/leads/${id}`, method: "PATCH", body }),
      invalidatesTags: ["Search"],
    }),
    // Businesses excluded from future discovery (e.g. imported from a CRM
    // export of already-contacted companies) — see excludedDomains in
    // schema.ts and discovery.ts's excludeDomains handling.
    getExclusions: builder.query<{ domains: string[]; total: number }, void>({
      query: () => "/api/exclusions",
      providesTags: ["Exclusions"],
    }),
    importExclusions: builder.mutation<{ imported: number; total: number }, string>({
      query: (csv) => ({ url: "/api/exclusions/import", method: "POST", body: { csv } }),
      invalidatesTags: ["Exclusions"],
    }),
    deleteExclusion: builder.mutation<{ deleted: string }, string>({
      query: (domain) => ({ url: `/api/exclusions/${encodeURIComponent(domain)}`, method: "DELETE" }),
      invalidatesTags: ["Exclusions"],
    }),
    clearExclusions: builder.mutation<{ cleared: boolean }, void>({
      query: () => ({ url: "/api/exclusions", method: "DELETE" }),
      invalidatesTags: ["Exclusions"],
    }),
  }),
});

export const {
  useCreateSearchMutation,
  useGetSearchStatusQuery,
  useGetSearchResultsQuery,
  useGetLeadGroupsQuery,
  useGetAllLeadsQuery,
  useUpdateLeadMutation,
  useGetExclusionsQuery,
  useImportExclusionsMutation,
  useDeleteExclusionMutation,
  useClearExclusionsMutation,
} = api;
