import { scrapePage } from "./scrape";
import { extractContactDetails } from "./extract";
import type { ExtractedContactDetails, SocialLinks } from "../types";

export type ContactPayload = ExtractedContactDetails & { socialLinks: SocialLinks };

const EMPTY_CONTACT_DETAILS: ExtractedContactDetails = {
  email: null,
  description: null,
  ownerName: null,
  ownerTitle: null,
};

// Most business sites don't put their email on the homepage — it's far more
// commonly on a dedicated contact page. The previous behavior only ever
// scraped the homepage, so it missed real, published emails purely because
// it never looked at the page they were actually on. This is a fixed list,
// not an LLM decision: "try these few common paths" doesn't need judgment,
// it needs a cheap retry — see the project notes on when a decision
// actually warrants an agent versus a plain rule.
const FALLBACK_PATHS = ["/contact", "/contact-us", "/about"];

/**
 * Looks for a business's contact details starting at its homepage, and — if
 * no email was found there — automatically also tries a small set of common
 * contact-page paths before giving up.
 *
 * @param scrape / @param extract — injectable for testing without hitting a
 *   real network or LLM; default to the real implementations in production.
 */
export async function findContactDetails(
  websiteUrl: string,
  scrape: typeof scrapePage = scrapePage,
  extract: typeof extractContactDetails = extractContactDetails
): Promise<{ contactDetails: ContactPayload | null; scrapedUrl: string } | null> {
  const homepage = await scrape(websiteUrl);
  if (!homepage) return null; // site unreachable entirely — nothing to fall back to

  const homepageResult = await extract(homepage);
  // pageEmail catches emails the text-only LLM extraction never sees at all —
  // an icon-only "envelope button" mailto link, or a Cloudflare-obfuscated
  // address — see extractPageEmail in scrape.ts.
  const homepageEmail = homepageResult?.email ?? homepage.pageEmail;
  let mergedSocialLinks = homepage.socialLinks;

  if (homepageEmail) {
    return {
      contactDetails: { ...(homepageResult ?? EMPTY_CONTACT_DETAILS), email: homepageEmail, socialLinks: mergedSocialLinks },
      scrapedUrl: websiteUrl,
    };
  }

  for (const path of FALLBACK_PATHS) {
    let fallbackUrl: string;
    try {
      fallbackUrl = new URL(path, websiteUrl).toString();
    } catch {
      continue; // websiteUrl wasn't a valid base to resolve against
    }

    const fallbackPage = await scrape(fallbackUrl);
    if (!fallbackPage) continue; // 404, timeout, non-HTML — just try the next path

    mergedSocialLinks = { ...mergedSocialLinks, ...fallbackPage.socialLinks };
    const fallbackResult = await extract(fallbackPage);
    const fallbackEmail = fallbackResult?.email ?? fallbackPage.pageEmail;
    if (fallbackEmail) {
      return {
        contactDetails: {
          email: fallbackEmail,
          // Prefer the homepage's description (usually more polished
          // "About us" copy) over a contact page's, which rarely has any.
          description: homepageResult?.description ?? fallbackResult?.description ?? null,
          ownerName: fallbackResult?.ownerName ?? homepageResult?.ownerName ?? null,
          ownerTitle: fallbackResult?.ownerTitle ?? homepageResult?.ownerTitle ?? null,
          socialLinks: mergedSocialLinks,
        },
        scrapedUrl: fallbackUrl,
      };
    }
  }

  // No email found anywhere tried — still return whatever the homepage did
  // find (description, owner, social links), rather than nothing at all.
  return {
    contactDetails: homepageResult
      ? { ...homepageResult, socialLinks: mergedSocialLinks }
      : { ...EMPTY_CONTACT_DETAILS, socialLinks: mergedSocialLinks },
    scrapedUrl: websiteUrl,
  };
}
