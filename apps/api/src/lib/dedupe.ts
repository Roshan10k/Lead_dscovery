/** Normalizes a business name into a key for exact-match dedup. */
export function normalizeDedupeKey(businessName: string): string {
  return businessName.trim().toLowerCase();
}
