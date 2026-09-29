import { Elysia, t } from "elysia";
import { cors } from "@elysiajs/cors";
import { eq, and, desc, sql, getTableColumns } from "drizzle-orm";
import { db } from "./db/client";
import { searches, leads, excludedDomains } from "./db/schema";
import { runSearchPipeline, runAgentSearchPipeline } from "./services/pipeline";
import { leadsToCsv } from "./lib/csv";
import { extractDomain } from "./lib/domain";

// Column names recognized when importing an exclusion list — a CRM export's
// column naming isn't standardized, so a handful of common variants are
// matched (case-insensitively) against the header row.
const EXCLUSION_COLUMN_NAMES = ["website", "domain", "url", "email", "company website", "site"];

// Minimal CSV cell split — handles simple quoted fields. Domain/email/URL
// values aren't expected to contain embedded commas, so this doesn't need
// full RFC 4180 quoting support the way a general CSV parser would.
function parseCsvLine(line: string): string[] {
  return line.split(",").map((cell) => cell.trim().replace(/^"|"$/g, ""));
}

// A (keyword, location) group is matched by exact, normalized (trimmed,
// lowercased) text — same philosophy as the dedup exclusion set in
// pipeline.ts: fuzzy/semantic matching of search intent ("Cleaning Business"
// vs "Commercial Cleaning") is a much bigger problem than this app needs to
// solve, so near-miss phrasing just produces a separate, more granular group
// rather than being merged.
function groupMatchClause(keyword: string, location: string) {
  return and(
    sql`lower(trim(${searches.keyword})) = ${keyword.trim().toLowerCase()}`,
    sql`lower(trim(${searches.location})) = ${location.trim().toLowerCase()}`
  );
}

// Upper bound on a single /api/leads response, regardless of what a caller
// asks for via ?limit=. As the accumulated lead count grows with ongoing
// use, this keeps a single request from returning an unbounded payload;
// there's no "load more" pagination UI yet, so it's a simplification worth
// revisiting once real usage shows whether that's actually needed.
const MAX_LEADS_LIMIT = 1000;
const DEFAULT_LEADS_LIMIT = 500;

// Route definitions only, no .listen() — kept separate from index.ts so
// tests can import this and call `.handle(request)` directly without
// binding a real port (see src/__tests__/routes.test.ts).
export const app = new Elysia()
  .use(cors())

  .get("/health", () => ({ ok: true }))

  // Create a search job. Kicks off the pipeline in the background and
  // returns immediately with the searchId so the frontend can poll status.
  // Accepts either an exact { keyword, location } or a free-text { goal } —
  // the latter runs the search-strategy agent (searchAgent.ts) first to
  // resolve it into a keyword+location before the rest of the pipeline
  // (discovery/scrape/extract) runs, which is identical either way.
  .post(
    "/api/search",
    async ({ body, set }) => {
      if ("goal" in body) {
        const goal = body.goal.trim();
        if (!goal) {
          set.status = 400;
          return { error: "goal is required" };
        }

        // keyword/location are resolved asynchronously by the agent — these
        // placeholders are overwritten before any lead is ever inserted, so
        // no consumer of the row (dedup, grouping, export) ever sees them.
        const [search] = await db.insert(searches).values({ keyword: goal, location: "", goal }).returning();

        runAgentSearchPipeline(search.id, goal);

        return { searchId: search.id };
      }

      const keyword = body.keyword.trim();
      const location = body.location.trim();

      if (!keyword || !location) {
        set.status = 400;
        return { error: "keyword and location are both required" };
      }

      const [search] = await db
        .insert(searches)
        .values({ keyword, location })
        .returning();

      // Fire and forget — do not await. Errors are captured inside the
      // pipeline itself and written back onto the search row.
      runSearchPipeline(search.id, keyword, location);

      return { searchId: search.id };
    },
    {
      body: t.Union([
        t.Object({
          keyword: t.String(),
          location: t.String(),
        }),
        t.Object({
          goal: t.String(),
        }),
      ]),
    }
  )

  // Poll search status/progress.
  .get("/api/search/:id", async ({ params, set }) => {
    const [search] = await db.select().from(searches).where(eq(searches.id, params.id));
    if (!search) {
      set.status = 404;
      return { error: "search not found" };
    }
    return search;
  })

  // Fetch stored leads for a search.
  .get("/api/search/:id/results", async ({ params, set }) => {
    const [search] = await db.select().from(searches).where(eq(searches.id, params.id));
    if (!search) {
      set.status = 404;
      return { error: "search not found" };
    }
    const results = await db.select().from(leads).where(eq(leads.searchId, params.id));
    return { search, leads: results };
  })

  // Update a lead's outreach status and/or notes — the "what did I do with
  // this lead" tracking layer, separate from the discovery pipeline itself.
  .patch(
    "/api/leads/:id",
    async ({ params, body, set }) => {
      const updates: Partial<typeof leads.$inferInsert> = {};
      if (body.outreachStatus !== undefined) updates.outreachStatus = body.outreachStatus;
      if (body.notes !== undefined) updates.notes = body.notes;

      if (Object.keys(updates).length === 0) {
        set.status = 400;
        return { error: "at least one of outreachStatus or notes is required" };
      }

      const [updated] = await db.update(leads).set(updates).where(eq(leads.id, params.id)).returning();
      if (!updated) {
        set.status = 404;
        return { error: "lead not found" };
      }
      return updated;
    },
    {
      body: t.Object({
        outreachStatus: t.Optional(
          t.Union([
            t.Literal("new"),
            t.Literal("contacted"),
            t.Literal("interested"),
            t.Literal("not_interested"),
            t.Literal("won"),
          ])
        ),
        notes: t.Optional(t.Nullable(t.String())),
      }),
    }
  )

  // Optional CSV export.
  .get("/api/search/:id/export", async ({ params, set }) => {
    const results = await db.select().from(leads).where(eq(leads.searchId, params.id));
    const csv = leadsToCsv(results);

    set.headers["Content-Type"] = "text/csv";
    set.headers["Content-Disposition"] = `attachment; filename="leads-${params.id}.csv"`;
    return csv;
  })

  // Every lead ever collected, across all searches — the accumulated
  // dataset dedup (pipeline.ts) is building up over time, not just a single
  // search's results. Optionally scoped to one (keyword, location) group —
  // see /api/leads/groups for the list of groups this can filter to.
  .get(
    "/api/leads",
    async ({ query }) => {
      const limit = Math.min(Number(query.limit ?? DEFAULT_LEADS_LIMIT) || DEFAULT_LEADS_LIMIT, MAX_LEADS_LIMIT);
      const scoped = query.keyword && query.location;

      const base = db
        .select(getTableColumns(leads))
        .from(leads)
        .innerJoin(searches, eq(leads.searchId, searches.id));

      const results = scoped
        ? await base
            .where(groupMatchClause(query.keyword!, query.location!))
            .orderBy(desc(leads.createdAt))
            .limit(limit)
        : await db.select().from(leads).orderBy(desc(leads.createdAt)).limit(limit);

      const countQuery = db.select({ count: sql<number>`count(*)::int` }).from(leads);
      const [{ count }] = scoped
        ? await countQuery.innerJoin(searches, eq(leads.searchId, searches.id)).where(groupMatchClause(query.keyword!, query.location!))
        : await countQuery;

      return { leads: results, total: count };
    },
    {
      query: t.Object({
        limit: t.Optional(t.String()),
        keyword: t.Optional(t.String()),
        location: t.Optional(t.String()),
      }),
    }
  )

  .get(
    "/api/leads/export",
    async ({ query, set }) => {
      const scoped = query.keyword && query.location;

      const results = scoped
        ? await db
            .select(getTableColumns(leads))
            .from(leads)
            .innerJoin(searches, eq(leads.searchId, searches.id))
            .where(groupMatchClause(query.keyword!, query.location!))
            .orderBy(desc(leads.createdAt))
        : await db.select().from(leads).orderBy(desc(leads.createdAt));

      const csv = leadsToCsv(results);

      set.headers["Content-Type"] = "text/csv";
      set.headers["Content-Disposition"] = `attachment; filename="${scoped ? `${query.keyword}-${query.location}-` : "all-"}leads.csv"`;
      return csv;
    },
    {
      query: t.Object({
        keyword: t.Optional(t.String()),
        location: t.Optional(t.String()),
      }),
    }
  )

  // Distinct (keyword, location) groups the accumulated leads fall into,
  // with a count and most-recent-activity timestamp per group — powers the
  // "All Leads" tab's group list so leads aren't shown as one undifferentiated
  // pile once there are hundreds of them.
  .get("/api/leads/groups", async () => {
    const groups = await db
      .select({
        // MIN() rather than tracking "most recent casing" — arbitrary but
        // deterministic; casing consistency across repeat searches is a
        // cosmetic concern, not worth a more complex query for.
        keyword: sql<string>`min(${searches.keyword})`,
        location: sql<string>`min(${searches.location})`,
        leadCount: sql<number>`count(${leads.id})::int`,
        mostRecentAt: sql<string>`max(${leads.createdAt})`,
      })
      .from(leads)
      .innerJoin(searches, eq(leads.searchId, searches.id))
      .groupBy(sql`lower(trim(${searches.keyword})), lower(trim(${searches.location}))`)
      .orderBy(desc(sql`max(${leads.createdAt})`));

    return { groups };
  })

  // Import a list of already-known businesses (e.g. a CRM export) as
  // domains to exclude from future discovery — extends the placeId dedup
  // in pipeline.ts to businesses this app hasn't found itself yet, but the
  // user already knows about from elsewhere. Accepts raw CSV text (not a
  // multipart upload) — the frontend reads the file client-side and posts
  // its text content, which avoids multipart form parsing entirely.
  .post(
    "/api/exclusions/import",
    async ({ body, set }) => {
      const lines = body.csv.split(/\r?\n/).filter((l) => l.trim().length > 0);
      if (lines.length === 0) {
        set.status = 400;
        return { error: "csv is empty" };
      }

      const headerCells = parseCsvLine(lines[0]).map((c) => c.toLowerCase());
      const colIndex = headerCells.findIndex((c) => EXCLUSION_COLUMN_NAMES.includes(c));
      // No recognized header column — treat every line (including the
      // first) as a raw domain/email/URL value rather than assuming line 1
      // is a header that just happens to use an unrecognized column name.
      const dataLines = colIndex >= 0 ? lines.slice(1) : lines;

      const domains = new Set<string>();
      for (const line of dataLines) {
        const cells = parseCsvLine(line);
        const raw = colIndex >= 0 ? cells[colIndex] : cells[0];
        const domain = raw ? extractDomain(raw) : null;
        if (domain) domains.add(domain);
      }

      if (domains.size === 0) {
        set.status = 400;
        return { error: "no valid domains or emails found in the uploaded file" };
      }

      await db
        .insert(excludedDomains)
        .values([...domains].map((domain) => ({ domain })))
        .onConflictDoNothing();

      const [{ count }] = await db.select({ count: sql<number>`count(*)::int` }).from(excludedDomains);
      return { imported: domains.size, total: count };
    },
    { body: t.Object({ csv: t.String() }) }
  )

  .get("/api/exclusions", async () => {
    const rows = await db.select().from(excludedDomains).orderBy(desc(excludedDomains.createdAt));
    return { domains: rows.map((r) => r.domain), total: rows.length };
  })

  .delete("/api/exclusions/:domain", async ({ params, set }) => {
    const deleted = await db.delete(excludedDomains).where(eq(excludedDomains.domain, params.domain)).returning();
    if (deleted.length === 0) {
      set.status = 404;
      return { error: "domain not found" };
    }
    return { deleted: params.domain };
  })

  .delete("/api/exclusions", async () => {
    await db.delete(excludedDomains);
    return { cleared: true };
  });

export type App = typeof app;
