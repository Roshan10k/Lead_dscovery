export type SearchStatus =
  | "pending"
  | "discovering"
  | "scraping"
  | "extracting"
  | "completed"
  | "failed";

export interface SearchRecord {
  id: string;
  keyword: string;
  location: string;
  status: SearchStatus;
  candidateCount: number;
  processedCount: number;
  errorMessage: string | null;
  createdAt: string;
  completedAt: string | null;
}

export interface Lead {
  id: string;
  searchId: string;
  businessName: string;
  location: string | null;
  phone: string | null;
  email: string | null;
  website: string | null;
  description: string | null;
  sourceUrl: string;
  createdAt: string;
}
