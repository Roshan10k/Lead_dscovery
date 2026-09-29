export type SearchStatus =
  | "pending"
  | "planning"
  | "discovering"
  | "scraping"
  | "extracting"
  | "completed"
  | "failed";

// One attempt the search-strategy agent made while turning a free-text goal
// into a keyword+location query — see the API's searchAgent.ts.
export interface SearchStep {
  keyword: string;
  location: string;
  candidateCount: number;
  verdict: string;
}

export interface SearchRecord {
  id: string;
  keyword: string;
  location: string;
  // The original natural-language input, when this search came from the
  // "describe your goal" mode rather than an exact keyword+location — null
  // otherwise. keyword/location above are always the resolved query either way.
  goal: string | null;
  searchSteps: SearchStep[] | null;
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
  // Whether the email's domain can actually receive mail (DNS MX/A record
  // check) — null means no email, or the check was inconclusive. Not a real
  // SMTP mailbox check; see the API's verifyEmail.ts for why.
  emailVerified: boolean | null;
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

export type FitScore = "strong_fit" | "possible_fit" | "poor_fit";

export type QualificationJobStatus = "pending" | "processing" | "completed" | "failed";

export interface QualificationJob {
  id: string;
  offering: string;
  leadIds: string[];
  status: QualificationJobStatus;
  processedCount: number;
  totalCount: number;
  errorMessage: string | null;
  createdAt: string;
  completedAt: string | null;
}

export interface LeadQualification {
  id: string;
  leadId: string;
  offeringKey: string;
  offering: string;
  fitScore: FitScore;
  reasoning: string;
  createdAt: string;
}
