// Legal/corporate suffixes stripped so e.g. "Clean Co" and "Clean Co Ltd"
// are recognized as the same business. Anchored to the END of the name only
// (never stripped mid-string) — a business literally named "Incorporated
// Builders" shouldn't get mangled just because "incorporated" happens to
// appear in it. Deliberately excludes bare "co"/"company": those are often
// part of the actual brand name itself (e.g. "Clean Co"), and stripping
// them would risk merging two genuinely different businesses that happen
// to share a generic word. This stays an exact-match dedup on a more
// aggressively normalized name — not fuzzy/similarity matching, which was
// explicitly scoped out elsewhere in this project for the same reason.
const TRAILING_LEGAL_SUFFIX = /[.,]?\s*\b(ltd|limited|llc|l\.l\.c\.?|inc|incorporated|corp|corporation|plc|llp|pty)\.?\s*$/i;

/** Normalizes a business name into a key for exact-match dedup. */
export function normalizeDedupeKey(businessName: string): string {
  let name = businessName.toLowerCase().trim();

  // Loop (bounded) to handle compounded suffixes like "Pty Ltd" — each pass
  // only strips one trailing suffix word.
  for (let i = 0; i < 3; i++) {
    const stripped = name.replace(TRAILING_LEGAL_SUFFIX, "").trim();
    if (stripped === name) break;
    name = stripped;
  }

  return name
    .replace(/['’]/g, "") // apostrophes removed outright, not replaced with a space — "Mike's" and "Mikes" should collide, not split into "mike s"
    .replace(/[^\w\s]/g, " ") // remaining punctuation (periods, commas, ampersands...) → space
    .replace(/\s+/g, " ")
    .trim();
}
