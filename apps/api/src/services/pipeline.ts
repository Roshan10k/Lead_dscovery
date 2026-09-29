import { eq, isNotNull } from "drizzle-orm";
import { db } from "../db/client";
import { searches, leads, excludedDomains } from "../db/schema";
import { discoverCandidates } from "./discovery";
import { scrapePage } from "./scrape";
import { extractLead } from "./extract";
import { findContactDetails, type ContactPayload } from "./contactFinder";
import { normalizeDedupeKey } from "../lib/dedupe";
import { getCached, setCached } from "../lib/cache";
import type { ExtractedLead, SocialLinks } from "../types";

const CONCURRENCY = 3;

// What actually gets cached per URL: the LLM-derived fields plus the
// scrape-derived social links, bundled together. Caching them separately
// would mean a cache hit on one still had to re-scrape for the other,
// defeating the point of caching at all.
type CachedContactPayload = ContactPayload;
type CachedFullPayload = ExtractedLead & { socialLinks: SocialLinks };

/**
 * Runs the full discovery -> scrape -> extract -> store pipeline for one
 * search, updating its status as it goes. Runs in the background (fire and
 * forget from the route handler) so the API can respond immediately with a
 * searchId and the frontend polls for progress.
 */
export async function runSearchPipeline(searchId: string, keyword: string, location: string) {
  try {
    await setStatus(searchId, "discovering");

    // Businesses already surfaced by ANY past search — not scoped to this
    // exact keyword+location — so a repeat search for "Cleaning Business in
    // Australia" (or a differently-worded search that happens to surface
    // the same businesses) returns genuinely new leads instead of the same
    // companies again. See discovery.ts's MAX_PAGES for the cost bound this
    // is weighed against, and schema.ts's leads.placeId for why this is
    // permanent rather than scoped/expiring.
    const seenPlaceIdRows = await db
      .select({ placeId: leads.placeId })
      .from(leads)
      .where(isNotNull(leads.placeId));
    const excludePlaceIds = new Set(seenPlaceIdRows.map((r) => r.placeId!));

    // Domains imported from an external "already contacted" list (see
    // POST /api/exclusions/import) — extends the exclusion above to
    // businesses this app hasn't found itself yet, but the user already
    // knows about from outside it.
    const excludedDomainRows = await db.select({ domain: excludedDomains.domain }).from(excludedDomains);
    const excludeDomains = new Set(excludedDomainRows.map((r) => r.domain));

    const candidates = await discoverCandidates(keyword, location, excludePlaceIds, excludeDomains);

    await db
      .update(searches)
      .set({ candidateCount: candidates.length })
      .where(eq(searches.id, searchId));

    if (candidates.length === 0) {
      await db
        .update(searches)
        .set({ status: "completed", completedAt: new Date() })
        .where(eq(searches.id, searchId));
      return;
    }

    await setStatus(searchId, "scraping");

    const seenBusinessNames = new Set<string>();
    let processed = 0;

    // Simple bounded-concurrency worker pool so we don't hammer target sites
    // or the LLM provider all at once.
    let cursor = 0;
    async function worker() {
      while (cursor < candidates.length) {
        const candidate = candidates[cursor++];

        let lead: {
          businessName: string;
          location: string | null;
          phone: string | null;
          email: string | null;
          website: string | null;
          description: string | null;
          ownerName: string | null;
          ownerTitle: string | null;
          socialLinks: SocialLinks;
          latitude: number | null;
          longitude: number | null;
        } | null = null;

        if (candidate.knownBusinessName) {
          // Structured candidate (Serper Places) — identity is already trusted.
          // Only hit the LLM to pull contact details from the business's own
          // site, which Maps data doesn't include; social links are parsed
          // directly out of the same page's HTML (see scrape.ts), not
          // LLM-derived.
          let contactDetails: CachedContactPayload | null = null;
          if (candidate.knownWebsite) {
            // Check the page cache before scraping/calling the LLM at all —
            // the same business website is often surfaced again across
            // different searches. A cache hit skips both the network
            // request to the target site (fewer repeat requests = lower
            // blocking risk) and the LLM call (cost).
            const cached = await getCached<CachedContactPayload>(candidate.knownWebsite, "contact_details");
            if (cached.hit) {
              contactDetails = cached.payload;
            } else {
              await db.update(searches).set({ status: "extracting" }).where(eq(searches.id, searchId));
              // Most business sites don't put their email on the homepage —
              // this also tries /contact, /contact-us, /about before giving
              // up. See contactFinder.ts.
              const result = await findContactDetails(candidate.knownWebsite);
              contactDetails = result?.contactDetails ?? null;
              await setCached(candidate.knownWebsite, "contact_details", contactDetails);
            }
          }
          lead = {
            businessName: candidate.knownBusinessName,
            location: candidate.knownLocation ?? null,
            phone: candidate.knownPhone ?? null,
            email: contactDetails?.email ?? null,
            website: candidate.knownWebsite ?? null,
            description: contactDetails?.description ?? null,
            ownerName: contactDetails?.ownerName ?? null,
            ownerTitle: contactDetails?.ownerTitle ?? null,
            socialLinks: contactDetails?.socialLinks ?? {},
            latitude: candidate.knownLatitude ?? null,
            longitude: candidate.knownLongitude ?? null,
          };
        } else {
          // Unstructured candidate (DuckDuckGo organic search) — full LLM
          // extraction, including judging whether the page is a business at all.
          const cached = await getCached<CachedFullPayload>(candidate.url, "full");
          let extracted: CachedFullPayload | null;
          if (cached.hit) {
            extracted = cached.payload;
          } else {
            const page = await scrapePage(candidate.url);
            if (page) {
              await db.update(searches).set({ status: "extracting" }).where(eq(searches.id, searchId));
              const result = await extractLead(page);
              // See contactFinder.ts's mailtoEmail handling — same fix, same
              // reason: an icon-only mailto link has no visible text for the
              // LLM to read.
              extracted = result ? { ...result, email: result.email ?? page.mailtoEmail, socialLinks: page.socialLinks } : null;
            } else {
              extracted = null;
            }
            await setCached(candidate.url, "full", extracted);
          }
          if (extracted) lead = { ...extracted, latitude: null, longitude: null };
        }

        processed++;
        await db.update(searches).set({ processedCount: processed }).where(eq(searches.id, searchId));

        if (!lead) continue;

        // Basic dedup on normalized business name (Day 6 "nice to have").
        const dedupeKey = normalizeDedupeKey(lead.businessName);
        if (seenBusinessNames.has(dedupeKey)) continue;
        seenBusinessNames.add(dedupeKey);

        await db.insert(leads).values({
          searchId,
          businessName: lead.businessName,
          location: lead.location,
          phone: lead.phone,
          email: lead.email,
          website: lead.website,
          description: lead.description,
          ownerName: lead.ownerName,
          ownerTitle: lead.ownerTitle,
          socialLinks: lead.socialLinks,
          latitude: lead.latitude,
          longitude: lead.longitude,
          placeId: candidate.knownPlaceId ?? null,
          sourceUrl: candidate.url,
        });
      }
    }

    await Promise.all(Array.from({ length: Math.min(CONCURRENCY, candidates.length) }, worker));

    await db
      .update(searches)
      .set({ status: "completed", completedAt: new Date() })
      .where(eq(searches.id, searchId));
  } catch (err) {
    await db
      .update(searches)
      .set({
        status: "failed",
        errorMessage: err instanceof Error ? err.message : "Unknown error",
        completedAt: new Date(),
      })
      .where(eq(searches.id, searchId));
  }
}

async function setStatus(searchId: string, status: (typeof searches.$inferSelect)["status"]) {
  await db.update(searches).set({ status }).where(eq(searches.id, searchId));
}
