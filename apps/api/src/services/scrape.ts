import type { CheerioAPI } from "cheerio";
import type { SocialLinks } from "../types";

const FETCH_TIMEOUT_MS = 10_000;
const MAX_TEXT_LENGTH = 6000; // keep LLM prompts small/cheap

export interface ScrapedPage {
  url: string;
  title: string;
  text: string;
  socialLinks: SocialLinks;
  // An email found via a `mailto:` link's href, independent of the LLM
  // extraction step — see extractMailtoEmail for why this exists.
  mailtoEmail: string | null;
}

// Matches a business's own social media page links, not e.g. Facebook's own
// footer links to "facebook.com/policies" etc. — restricted to the profile-
// path shape of each platform, and excludes their app-sharing/login utility
// paths so a page's "Share on Facebook" button isn't mistaken for a profile.
const SOCIAL_PATTERNS: { platform: keyof SocialLinks; hostname: RegExp; excludePath: RegExp }[] = [
  { platform: "facebook", hostname: /(^|\.)facebook\.com$/i, excludePath: /^\/(sharer|share|dialog|policies|help|login|plugins)(\/|$)/i },
  { platform: "instagram", hostname: /(^|\.)instagram\.com$/i, excludePath: /^\/(accounts|explore|p|reel)(\/|$)/i },
  { platform: "linkedin", hostname: /(^|\.)linkedin\.com$/i, excludePath: /^\/(sharing|shareArticle|login|uas)(\/|$)/i },
  { platform: "twitter", hostname: /(^|\.)(twitter\.com|x\.com)$/i, excludePath: /^\/(intent|share|login|i)(\/|$)/i },
];

/**
 * Extracts links to the business's own social media profiles from its
 * website — a deterministic, cheap alternative to scraping the social
 * platforms themselves (which sit behind login walls, aggressively block
 * automated access, and prohibit it in their own Terms of Service; see
 * README for the fuller reasoning). Scanned from the full, unmodified page
 * before script/nav/footer stripping, since these links live almost
 * entirely in the footer or header — code that ran after that stripping
 * would find nothing.
 */
function extractSocialLinks($: CheerioAPI): SocialLinks {
  const found: SocialLinks = {};

  $("a[href]").each((_, el) => {
    const href = $(el).attr("href");
    if (!href) return;

    let parsed: URL;
    try {
      parsed = new URL(href);
    } catch {
      return; // relative or malformed href — not a social link
    }

    for (const { platform, hostname, excludePath } of SOCIAL_PATTERNS) {
      if (found[platform]) continue; // keep the first match per platform
      if (hostname.test(parsed.hostname) && !excludePath.test(parsed.pathname) && parsed.pathname.length > 1) {
        found[platform] = parsed.toString();
      }
    }
  });

  return found;
}

/**
 * Pulls an email address straight out of a `mailto:` link's href — found
 * live during testing: some sites put their email only on an icon-only
 * "envelope" button (no visible text at all, just the href), which the
 * text-only LLM extraction below can never see no matter how good the
 * prompt is. Same rationale and same "read hrefs before stripping" approach
 * as extractSocialLinks above.
 */
// Loose but sufficient: reject anything that isn't a plausible "x@y.z" once
// the query-string/whitespace stripping below has run — found live against a
// real site whose mailto href had a malformed query string (a literal space
// instead of "?subject=..."), which without this check leaked straight into
// the "email" field as "info@example.com subject=complaints".
const PLAUSIBLE_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function extractMailtoEmail($: CheerioAPI): string | null {
  let found: string | null = null;
  $("a[href^='mailto:']").each((_, el) => {
    if (found) return;
    const href = $(el).attr("href");
    if (!href) return;

    let raw = href.slice("mailto:".length);
    try {
      raw = decodeURIComponent(raw);
    } catch {
      // malformed percent-encoding — fall through and use it as-is
    }
    const email = raw.split(/[?\s]/)[0].trim();
    if (PLAUSIBLE_EMAIL.test(email)) found = email;
  });
  return found;
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

    const socialLinks = extractSocialLinks($);
    const mailtoEmail = extractMailtoEmail($);

    $("script, style, noscript, svg, nav, footer").remove();

    const title = $("title").first().text().trim();
    const text = $("body").text().replace(/\s+/g, " ").trim().slice(0, MAX_TEXT_LENGTH);

    if (!text) return null;
    return { url, title, text, socialLinks, mailtoEmail };
  } catch {
    // Failed/timed-out page — the pipeline treats this as a skip, not a fatal error.
    return null;
  }
}
