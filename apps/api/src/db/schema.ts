import { pgTable, text, timestamp, uuid, integer, doublePrecision, jsonb } from "drizzle-orm/pg-core";
import type { SocialLinks } from "../types";

export const searches = pgTable("searches", {
  id: uuid("id").primaryKey().defaultRandom(),
  keyword: text("keyword").notNull(),
  location: text("location").notNull(),
  status: text("status", {
    enum: ["pending", "discovering", "scraping", "extracting", "completed", "failed"],
  })
    .notNull()
    .default("pending"),
  candidateCount: integer("candidate_count").notNull().default(0),
  processedCount: integer("processed_count").notNull().default(0),
  errorMessage: text("error_message"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  completedAt: timestamp("completed_at", { withTimezone: true }),
});

export const leads = pgTable("leads", {
  id: uuid("id").primaryKey().defaultRandom(),
  searchId: uuid("search_id")
    .notNull()
    .references(() => searches.id, { onDelete: "cascade" }),
  businessName: text("business_name").notNull(),
  location: text("location"),
  phone: text("phone"),
  email: text("email"),
  website: text("website"),
  description: text("description"),
  ownerName: text("owner_name"),
  ownerTitle: text("owner_title"),
  socialLinks: jsonb("social_links").$type<SocialLinks>(),
  latitude: doublePrecision("latitude"),
  longitude: doublePrecision("longitude"),
  // Google's stable per-business Place ID (Serper Places' `cid`), null for
  // leads discovered via the DuckDuckGo fallback (no stable ID available
  // there). Used to permanently exclude a business from ever being
  // resurfaced as a "new" lead once it's been shown once, across ALL past
  // searches — not just repeats of the exact same keyword+location. See
  // pipeline.ts for how this set is built and passed into discovery.
  placeId: text("place_id"),
  sourceUrl: text("source_url").notNull(),
  // Outreach pipeline state — separate concept from `searches.status` (which
  // tracks the discovery job itself, not what a human did with a result
  // afterward). Named distinctly (not just `status`) so the two are never
  // confused when a query touches both tables.
  outreachStatus: text("outreach_status", {
    enum: ["new", "contacted", "interested", "not_interested", "won"],
  })
    .notNull()
    .default("new"),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// Caches the (scrape + LLM extraction) result for a given URL so that the
// same business page is not re-fetched and re-sent to the LLM on every
// search that happens to surface it again. This is the concrete mechanism
// behind "avoid getting blocked while scraping": fewer repeat requests to
// the same target site. `id` is `${kind}::${url}` since the same URL could
// in principle be processed by either extraction path.
export const pageCache = pgTable("page_cache", {
  id: text("id").primaryKey(),
  url: text("url").notNull(),
  kind: text("kind", { enum: ["full", "contact_details"] }).notNull(),
  // JSON-serialized extraction payload, or null to cache a confirmed
  // negative result (e.g. "not a business listing") so a dead/irrelevant
  // page isn't re-scraped and re-sent to the LLM either.
  payload: text("payload"),
  cachedAt: timestamp("cached_at", { withTimezone: true }).notNull().defaultNow(),
});

// A business's own domain, imported from an external list (e.g. a CRM
// export of already-contacted companies) so discovery skips it in future
// searches too — extends the placeId-based dedup above to businesses the
// user already knows about from outside this app, not just what this app
// has found before.
export const excludedDomains = pgTable("excluded_domains", {
  domain: text("domain").primaryKey(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type Search = typeof searches.$inferSelect;
export type NewSearch = typeof searches.$inferInsert;
export type Lead = typeof leads.$inferSelect;
export type NewLead = typeof leads.$inferInsert;
export type PageCache = typeof pageCache.$inferSelect;
export type NewPageCache = typeof pageCache.$inferInsert;
export type ExcludedDomain = typeof excludedDomains.$inferSelect;
