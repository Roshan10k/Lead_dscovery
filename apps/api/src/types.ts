export interface CandidateUrl {
  url: string;
  title?: string;
  // Present when discovery came from a structured source (Serper Places /
  // Google Maps data) that already identified a real business. The pipeline
  // trusts these directly instead of asking the LLM to guess business
  // identity from page text, and only uses the LLM to fill in email/
  // description from the business's own website.
  knownBusinessName?: string;
  knownLocation?: string;
  knownPhone?: string;
  knownWebsite?: string;
}

export interface ExtractedLead {
  businessName: string;
  location: string | null;
  phone: string | null;
  email: string | null;
  website: string | null;
  description: string | null;
}
