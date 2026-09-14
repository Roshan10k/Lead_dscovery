import type { CandidateUrl } from "../types";

const MAX_CANDIDATES = 8;

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
export async function discoverCandidates(keyword: string, location: string): Promise<CandidateUrl[]> {
  if (process.env.SERPER_API_KEY) {
    return discoverWithSerperPlaces(keyword, location);
  }
  return discoverWithDuckDuckGo(`${keyword} in ${location}`);
}

async function discoverWithSerperPlaces(keyword: string, location: string): Promise<CandidateUrl[]> {
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
    body: JSON.stringify({ q: `${keyword} in ${location}`, location, num: MAX_CANDIDATES }),
  });

  if (!res.ok) {
    throw new Error(`Serper Places discovery failed: ${res.status} ${res.statusText}`);
  }

  const data = (await res.json()) as {
    places?: { title: string; address?: string; phoneNumber?: string; website?: string; cid?: string }[];
  };

  return (data.places ?? []).slice(0, MAX_CANDIDATES).map((p) => ({
    // Prefer the business's own site as the "url" (it's what gets scraped
    // for email); fall back to a Google Maps link so there's always a
    // source URL for verification even when a business has no website.
    url: p.website ?? `https://www.google.com/maps?cid=${p.cid}`,
    title: p.title,
    knownBusinessName: p.title,
    knownLocation: p.address,
    knownPhone: p.phoneNumber,
    knownWebsite: p.website,
  }));
}

async function discoverWithDuckDuckGo(query: string): Promise<CandidateUrl[]> {
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
    if (resolved) candidates.push({ url: resolved, title });
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
