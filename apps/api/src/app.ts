import { Elysia, t } from "elysia";
import { cors } from "@elysiajs/cors";
import { eq } from "drizzle-orm";
import { db } from "./db/client";
import { searches, leads } from "./db/schema";
import { runSearchPipeline } from "./services/pipeline";
import { csvEscape } from "./lib/csv";

// Route definitions only, no .listen() — kept separate from index.ts so
// tests can import this and call `.handle(request)` directly without
// binding a real port (see src/__tests__/routes.test.ts).
export const app = new Elysia()
  .use(cors())

  // TEMP debug logging to trace a reported "results show empty despite
  // backend having leads" bug — remove once diagnosed.
  .onRequest(({ request }) => {
    console.log(`[req] ${new Date().toISOString()} ${request.method} ${request.url}`);
  })

  .get("/health", () => ({ ok: true }))

  // Create a search job. Kicks off the pipeline in the background and
  // returns immediately with the searchId so the frontend can poll status.
  .post(
    "/api/search",
    async ({ body, set }) => {
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
      body: t.Object({
        keyword: t.String(),
        location: t.String(),
      }),
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

  // Optional CSV export.
  .get("/api/search/:id/export", async ({ params, set }) => {
    const results = await db.select().from(leads).where(eq(leads.searchId, params.id));

    const header = ["businessName", "location", "phone", "email", "website", "description", "sourceUrl"];
    const rows = results.map((lead) =>
      header.map((key) => csvEscape(String((lead as any)[key] ?? ""))).join(",")
    );
    const csv = [header.join(","), ...rows].join("\n");

    set.headers["Content-Type"] = "text/csv";
    set.headers["Content-Disposition"] = `attachment; filename="leads-${params.id}.csv"`;
    return csv;
  });

export type App = typeof app;
