import { extractDomain } from "../lib/domain";
import type { CandidateUrl } from "../types";

// How many candidate businesses to gather per search. Configurable via env
// rather than hardcoded, since the right number depends on how the app is
// being used — a fast live demo wants fewer (shorter wait, fewer LLM calls),
// real lead-generation work wants more. Empirically, Serper's Places API
// caps out at 10 results per request regardless of a higher `num` — getting
// past that requires pagination (see PLACES_PAGE_SIZE below), which costs
// one additional Serper request per extra page of 10.
const MAX_CANDIDATES = Number(process.env.DISCOVERY_MAX_CANDIDATES ?? 8);
const PLACES_PAGE_SIZE = 10;

// Safety cap on how many Serper pages a single search will fetch while
// hunting for candidates not already excluded (see excludePlaceIds below).
// Without this, a keyword+location whose business pool is nearly exhausted
// (most results already seen in past searches) could paginate indefinitely
// chasing a handful of new results, burning Serper credits with no bound.
// At 10 results/page this caps worst-case cost at 5 credits per search.
const MAX_PAGES = 5;

/**
 * Discovery layer: turns "keyword + location" into a small list of candidate
 * businesses worth scraping. Two backends are supported:
 *
 * 1. Serper.dev Places API (if SERPER_API_KEY is set) — queries Google Maps
 *    data directly and returns real, already-identified businesses (name,
 *    address, phone, website). This is deliberately NOT a generic web search:
 *    a plain "<keyword> in <location>" organic search mostly returns "how to
 *    start a X business" articles, industry reports and forum threads, not
 *    actual businesses — the LLM correctly rejects all of those as non-leads.
 *    Places search sidesteps that entirely.
 * 2. DuckDuckGo HTML endpoint (no key needed) — generic organic search, used
 *    as a free fallback so the app works out of the box with zero paid
 *    services. Lower precision than Places by nature (see above), which is
 *    why full LLM extraction (extractLead) is still applied to its results.
 *
 * Swap this file out for the ScrapeGraphAI "searchScraper" endpoint if you'd
 * rather use their managed discovery+scrape pipeline instead.
 */
/**
 * @param excludePlaceIds Business Place IDs to skip — used to permanently
 *   avoid resurfacing a business already returned by a past search (see
 *   leads.placeId in schema.ts and pipeline.ts for how this set is built).
 *   Only meaningful for the Serper Places path; the DuckDuckGo fallback has
 *   no stable per-business ID to dedupe against.
 * @param excludeDomains Business domains to skip — imported from an external
 *   list (e.g. a CRM export of already-contacted companies), see
 *   excludedDomains in schema.ts. Applies to both discovery backends, since
 *   a domain can be extracted from either one's result URLs.
 */
export async function discoverCandidates(
  keyword: string,
  location: string,
  excludePlaceIds: Set<string> = new Set(),
  excludeDomains: Set<string> = new Set()
): Promise<CandidateUrl[]> {
  if (process.env.SERPER_API_KEY) {
    return discoverWithSerperPlaces(keyword, location, excludePlaceIds, excludeDomains);
  }
  return discoverWithDuckDuckGo(`${keyword} in ${location}`, excludeDomains);
}

async function discoverWithSerperPlaces(
  keyword: string,
  location: string,
  excludePlaceIds: Set<string>,
  excludeDomains: Set<string>
): Promise<CandidateUrl[]> {
  const results: CandidateUrl[] = [];
  let page = 1;

  while (results.length < MAX_CANDIDATES && page <= MAX_PAGES) {
    const pagePlaces = await fetchSerperPlacesPage(keyword, location, page);
    if (pagePlaces.length === 0) break; // no more results available

    const fresh = pagePlaces.filter((p) => {
      if (p.knownPlaceId && excludePlaceIds.has(p.knownPlaceId)) return false;
      const domain = p.knownWebsite ? extractDomain(p.knownWebsite) : null;
      if (domain && excludeDomains.has(domain)) return false;
      return true;
    });
    results.push(...fresh);

    if (pagePlaces.length < PLACES_PAGE_SIZE) break; // that was the last page
    page++;
  }

  // Note: it's expected and correct for this to sometimes return fewer than
  // MAX_CANDIDATES (even zero) once a keyword+location's pool of not-yet-seen
  // businesses runs low — see the MAX_PAGES cap above.
  return results.slice(0, MAX_CANDIDATES);
}

async function fetchSerperPlacesPage(keyword: string, location: string, page: number): Promise<CandidateUrl[]> {
  // Send location both folded into the query text AND as Places' dedicated
  // `location` field. Neither alone is reliable for the casual, free-text
  // input this app's single location box actually gets:
  //   - `q` only ("Plumbers in London") ambiguates between London, UK and
  //     London, Ontario and returns a mix of both.
  //   - `location` only, when it's not an exact geocodable place name (e.g.
  //     the bare string "London" rather than "London, UK"), gets silently
  //     ignored by Serper and returns unrelated results from a fallback
  //     region instead of erroring — worse than not using it at all.
  // Sending both disambiguates correctly in practice for casual city/country
  // names without requiring users to type a fully-qualified location.
  const res = await fetch("https://google.serper.dev/places", {
    method: "POST",
    headers: {
      "X-API-KEY": process.env.SERPER_API_KEY!,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ q: `${keyword} in ${location}`, location, num: PLACES_PAGE_SIZE, page }),
  });

  if (!res.ok) {
    throw new Error(`Serper Places discovery failed: ${res.status} ${res.statusText}`);
  }

  const data = (await res.json()) as {
    places?: {
      title: string;
      address?: string;
      phoneNumber?: string;
      website?: string;
      cid?: string;
      latitude?: number;
      longitude?: number;
    }[];
  };

  return (data.places ?? []).map((p) => ({
    // Prefer the business's own site as the "url" (it's what gets scraped
    // for email); fall back to a Google Maps link so there's always a
    // source URL for verification even when a business has no website.
    url: p.website ?? `https://www.google.com/maps?cid=${p.cid}`,
    title: p.title,
    knownBusinessName: p.title,
    knownLocation: p.address,
    knownPhone: p.phoneNumber,
    knownWebsite: p.website,
    knownLatitude: p.latitude,
    knownLongitude: p.longitude,
    knownPlaceId: p.cid,
  }));
}

async function discoverWithDuckDuckGo(query: string, excludeDomains: Set<string>): Promise<CandidateUrl[]> {
  const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
  const res = await fetch(url, {
    headers: { "User-Agent": "Mozilla/5.0 (compatible; LeadDiscoveryBot/1.0)" },
  });

  if (!res.ok) {
    throw new Error(`DuckDuckGo discovery failed: ${res.status} ${res.statusText}`);
  }

  const html = await res.text();
  const cheerio = await import("cheerio");
  const $ = cheerio.load(html);

  const candidates: CandidateUrl[] = [];
  $(".result__a").each((_, el) => {
    if (candidates.length >= MAX_CANDIDATES) return;
    const href = $(el).attr("href");
    const title = $(el).text().trim();
    const resolved = resolveDuckDuckGoRedirect(href);
    if (!resolved) return;
    const domain = extractDomain(resolved);
    if (domain && excludeDomains.has(domain)) return;
    candidates.push({ url: resolved, title });
  });

  return candidates;
}

// DuckDuckGo's HTML result links are wrapped in a redirect: //duckduckgo.com/l/?uddg=<encoded>
function resolveDuckDuckGoRedirect(href: string | undefined): string | null {
  if (!href) return null;
  try {
    const full = href.startsWith("//") ? `https:${href}` : href;
    const parsed = new URL(full);
    const target = parsed.searchParams.get("uddg");
    return target ? decodeURIComponent(target) : full;
  } catch {
    return null;
  }
}
