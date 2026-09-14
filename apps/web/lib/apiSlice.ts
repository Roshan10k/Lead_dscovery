import { createApi, fetchBaseQuery } from "@reduxjs/toolkit/query/react";
import type { SearchRecord, Lead } from "./types";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:4000";

export const api = createApi({
  reducerPath: "api",
  baseQuery: fetchBaseQuery({ baseUrl: API_BASE_URL }),
  tagTypes: ["Search"],
  endpoints: (builder) => ({
    createSearch: builder.mutation<{ searchId: string }, { keyword: string; location: string }>({
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
  }),
});

export const { useCreateSearchMutation, useGetSearchStatusQuery, useGetSearchResultsQuery } = api;
