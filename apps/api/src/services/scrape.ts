const FETCH_TIMEOUT_MS = 10_000;
const MAX_TEXT_LENGTH = 6000; // keep LLM prompts small/cheap

export interface ScrapedPage {
  url: string;
  title: string;
  text: string;
}

/**
 * Fetches a public page and reduces it to visible text. Deliberately simple —
 * no headless browser, no JS rendering — which is enough for most business
 * listing / directory / "about us" pages within a 1-week MVP budget.
 */
export async function scrapePage(url: string): Promise<ScrapedPage | null> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

    const res = await fetch(url, {
      signal: controller.signal,
      headers: { "User-Agent": "Mozilla/5.0 (compatible; LeadDiscoveryBot/1.0)" },
    });
    clearTimeout(timeout);

    if (!res.ok) return null;

    const contentType = res.headers.get("content-type") ?? "";
    if (!contentType.includes("text/html")) return null;

    const html = await res.text();
    const cheerio = await import("cheerio");
    const $ = cheerio.load(html);

    $("script, style, noscript, svg, nav, footer").remove();

    const title = $("title").first().text().trim();
    const text = $("body").text().replace(/\s+/g, " ").trim().slice(0, MAX_TEXT_LENGTH);

    if (!text) return null;
    return { url, title, text };
  } catch {
    // Failed/timed-out page — the pipeline treats this as a skip, not a fatal error.
    return null;
  }
}
