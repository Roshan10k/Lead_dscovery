import { pgTable, text, timestamp, uuid, integer } from "drizzle-orm/pg-core";

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
  sourceUrl: text("source_url").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type Search = typeof searches.$inferSelect;
export type NewSearch = typeof searches.$inferInsert;
export type Lead = typeof leads.$inferSelect;
export type NewLead = typeof leads.$inferInsert;
