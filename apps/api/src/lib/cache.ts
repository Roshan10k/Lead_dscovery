import { eq } from "drizzle-orm";
import { db } from "../db/client";
import { pageCache } from "../db/schema";

const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24h

export type CacheKind = "full" | "contact_details";

function cacheId(url: string, kind: CacheKind): string {
  return `${kind}::${url}`;
}

/**
 * Looks up a cached (scrape + extract) result for a URL. Returns
 * { hit: false } on a cache miss or an expired entry; { hit: true, payload }
 * on a fresh hit, where `payload` is null for a cached negative result
 * (e.g. a page confirmed not to be a business listing).
 */
export async function getCached<T>(
  url: string,
  kind: CacheKind
): Promise<{ hit: true; payload: T | null } | { hit: false }> {
  const [row] = await db.select().from(pageCache).where(eq(pageCache.id, cacheId(url, kind)));
  if (!row) return { hit: false };

  const age = Date.now() - row.cachedAt.getTime();
  if (age > CACHE_TTL_MS) return { hit: false };

  return { hit: true, payload: row.payload ? (JSON.parse(row.payload) as T) : null };
}

/** Stores an extraction result (or null, for a confirmed negative result) for a URL. */
export async function setCached(url: string, kind: CacheKind, payload: unknown | null): Promise<void> {
  const id = cacheId(url, kind);
  const serialized = payload === null ? null : JSON.stringify(payload);

  await db
    .insert(pageCache)
    .values({ id, url, kind, payload: serialized, cachedAt: new Date() })
    .onConflictDoUpdate({
      target: pageCache.id,
      set: { payload: serialized, cachedAt: new Date() },
    });
}
