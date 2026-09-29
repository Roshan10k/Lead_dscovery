import dns from "node:dns/promises";
import type { MxRecord } from "node:dns";
import { extractDomain } from "../lib/domain";

const DNS_TIMEOUT_MS = 5_000;

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error("DNS lookup timed out")), ms)),
  ]);
}

// ENOTFOUND/ENODATA mean the DNS server definitively answered "no such
// record" — a real negative. Anything else (timeout, SERVFAIL, a resolver
// hiccup) is inconclusive, not a confirmed-dead domain, and is handled by
// the caller returning null rather than false for those.
function isDefinitiveDnsFailure(err: unknown): boolean {
  const code = (err as NodeJS.ErrnoException)?.code;
  return code === "ENOTFOUND" || code === "ENODATA";
}

// Narrowed to the single overload actually used, rather than `typeof
// dns.resolveMx`/`typeof dns.resolve4` — those types carry extra overloads
// (options-based variants returning a different record shape) that make a
// plain `async (hostname) => [...]` test fake ambiguous to type-check
// against for no benefit, since none of those overloads are ever called here.
export interface DnsLookup {
  resolveMx: (hostname: string) => Promise<MxRecord[]>;
  resolve4: (hostname: string) => Promise<string[]>;
}

const defaultDnsLookup: DnsLookup = { resolveMx: dns.resolveMx, resolve4: dns.resolve4 };

/**
 * Checks whether an email's domain is actually configured to receive mail —
 * has an MX record, or falls back to an A record per RFC 5321 §5.1 — rather
 * than a real SMTP mailbox-existence check. Confirmed live (not assumed)
 * that outbound port 25 is blocked on this network, which is true of most
 * residential ISPs and many hosting providers by default (anti-spam-relay
 * policy), so a real RCPT TO probe isn't a viable feature here. This still
 * catches a meaningful, common category of bad scraped data: typo'd
 * domains, expired/dead domains, and placeholder emails left on a template
 * site (e.g. "email@example.com") — just not a bad mailbox at an otherwise
 * real domain.
 *
 * Returns:
 * - true  — domain can receive mail (MX or fallback A record found)
 * - false — domain definitively cannot (no such domain/record)
 * - null  — inconclusive (malformed email, or the DNS lookup itself failed
 *   transiently) — deliberately distinct from `false` so a DNS hiccup never
 *   gets recorded as "this email is fake" the same way a genuinely dead
 *   domain does.
 */
export async function verifyEmailDomain(
  email: string,
  dnsLookup: DnsLookup = defaultDnsLookup,
  timeoutMs: number = DNS_TIMEOUT_MS
): Promise<boolean | null> {
  const domain = extractDomain(email);
  if (!domain) return null; // not even a parseable email

  try {
    const mxRecords = await withTimeout(dnsLookup.resolveMx(domain), timeoutMs);
    if (mxRecords.length > 0) return true;
  } catch (err) {
    if (!isDefinitiveDnsFailure(err)) return null;
    // No MX record — fall through to the A-record fallback below.
  }

  try {
    const aRecords = await withTimeout(dnsLookup.resolve4(domain), timeoutMs);
    return aRecords.length > 0;
  } catch (err) {
    return isDefinitiveDnsFailure(err) ? false : null;
  }
}
