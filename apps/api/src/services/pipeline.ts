import { eq } from "drizzle-orm";
import { db } from "../db/client";
import { searches, leads } from "../db/schema";
import { discoverCandidates } from "./discovery";
import { scrapePage } from "./scrape";
import { extractLead, extractEmailAndDescription } from "./extract";
import { normalizeDedupeKey } from "../lib/dedupe";

const CONCURRENCY = 3;

/**
 * Runs the full discovery -> scrape -> extract -> store pipeline for one
 * search, updating its status as it goes. Runs in the background (fire and
 * forget from the route handler) so the API can respond immediately with a
 * searchId and the frontend polls for progress.
 */
export async function runSearchPipeline(searchId: string, keyword: string, location: string) {
  try {
    await setStatus(searchId, "discovering");
    const candidates = await discoverCandidates(keyword, location);

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
        } | null = null;

        if (candidate.knownBusinessName) {
          // Structured candidate (Serper Places) — identity is already trusted.
          // Only hit the LLM to pull email/description from the business's own
          // site, which Maps data doesn't include.
          let email: string | null = null;
          let description: string | null = null;
          if (candidate.knownWebsite) {
            await db.update(searches).set({ status: "extracting" }).where(eq(searches.id, searchId));
            const page = await scrapePage(candidate.knownWebsite);
            if (page) {
              const extra = await extractEmailAndDescription(page);
              if (extra) {
                email = extra.email;
                description = extra.description;
              }
            }
          }
          lead = {
            businessName: candidate.knownBusinessName,
            location: candidate.knownLocation ?? null,
            phone: candidate.knownPhone ?? null,
            email,
            website: candidate.knownWebsite ?? null,
            description,
          };
        } else {
          // Unstructured candidate (DuckDuckGo organic search) — full LLM
          // extraction, including judging whether the page is a business at all.
          const page = await scrapePage(candidate.url);
          if (page) {
            await db.update(searches).set({ status: "extracting" }).where(eq(searches.id, searchId));
            const extracted = await extractLead(page);
            if (extracted) lead = extracted;
          }
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
