/**
 * Extracts a normalized domain (lowercase, no "www.") from a URL, bare
 * domain, or email address — the input format from an uploaded exclusion
 * list isn't guaranteed, so this accepts whichever of those three shapes
 * shows up in a given cell.
 */
export function extractDomain(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;

  const emailMatch = trimmed.match(/^[^\s@]+@([^\s@]+\.[^\s@]+)$/);
  if (emailMatch) return emailMatch[1].toLowerCase();

  try {
    const withProtocol = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
    const hostname = new URL(withProtocol).hostname;
    if (!hostname.includes(".")) return null; // rejects garbage like "https://localhost"
    return hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return null;
  }
}
