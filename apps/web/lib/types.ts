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

export interface SocialLinks {
  facebook?: string;
  instagram?: string;
  linkedin?: string;
  twitter?: string;
}

export interface LeadGroup {
  keyword: string;
  location: string;
  leadCount: number;
  mostRecentAt: string;
}

export type OutreachStatus = "new" | "contacted" | "interested" | "not_interested" | "won";

export interface Lead {
  id: string;
  searchId: string;
  businessName: string;
  location: string | null;
  phone: string | null;
  email: string | null;
  website: string | null;
  description: string | null;
  ownerName: string | null;
  ownerTitle: string | null;
  socialLinks: SocialLinks | null;
  latitude: number | null;
  longitude: number | null;
  outreachStatus: OutreachStatus;
  notes: string | null;
  sourceUrl: string;
  createdAt: string;
}
