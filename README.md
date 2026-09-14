# Lead Discovery MVP

Enter a keyword + location (e.g. **"Cleaning Business" / "Australia"**), and the app discovers
public web pages, uses an LLM to pull structured business info out of them, and shows the
results in a table with a source link for every row.

## Architecture

```mermaid
flowchart LR
    User(["User"]) --> UI["Next.js UI\n(RTK Query)"]
    UI -- "POST /api/search" --> API["Bun + Elysia API"]
    API -- "searchId (instant)" --> UI
    API -. "fire-and-forget" .-> Pipeline["Pipeline\n(bounded concurrency)"]
    Pipeline --> Discovery["Discovery\nSerper Places / DuckDuckGo"]
    Discovery --> Scrape["Scrape\nfetch + cheerio"]
    Scrape --> Extract["LLM Extraction\nGroq (JSON mode + Zod)"]
    Extract --> DB[("PostgreSQL\nvia Drizzle")]
    UI -- "poll GET /api/search/:id" --> API
    API -- "status + leads" --> DB
    UI -- "GET /api/search/:id/results" --> API
```


- **Frontend**: Next.js (App Router) + TypeScript + Tailwind CSS + Redux Toolkit + RTK Query.
  RTK Query polls `GET /api/search/:id` every 1.5s while a search is in progress, then fetches
  `GET /api/search/:id/results` once it completes.
- **Backend**: Bun + Elysia.js. `POST /api/search` creates a row and kicks off the pipeline in
  the background (fire-and-forget), so the request returns instantly with a `searchId`.
- **Discovery**: `apps/api/src/services/discovery.ts`. Uses **Serper.dev's Places API**
  (Google Maps data, free trial credits) if `SERPER_API_KEY` is set — this returns real,
  already-identified businesses (name, address, phone, website) directly, which matters:
  a plain organic web search for "`<keyword>` in `<location>`" mostly surfaces "how to start
  a cleaning business" articles, industry reports and forum threads, not actual businesses,
  and the LLM correctly rejects all of those as non-leads. Falls back to DuckDuckGo's HTML
  endpoint (free, no key required, generic organic search) if no Serper key is set, so the
  app works out of the box — with lower precision, since it's back to a plain web search.
- **Scraping**: `apps/api/src/services/scrape.ts`. Plain `fetch` + `cheerio`, strips
  scripts/styles/nav, truncates to ~6k chars. No headless browser — good enough for most
  business/listing pages within a 1-week budget; the tradeoff is it won't render JS-heavy sites.
- **LLM extraction**: `apps/api/src/services/extract.ts`. Uses **Groq** (OpenAI-compatible API,
  generous free tier) with a JSON-mode prompt and Zod validation. Two extraction paths: for
  Places candidates, the LLM only fills in email/description from the business's own site
  (`extractEmailAndDescription`) since name/phone/address are already known and trusted; for
  DuckDuckGo candidates, it does full extraction including judging whether a page is a business
  at all (`extractLead`). Any malformed response or non-business page is dropped rather than
  crashing the search. Default model is `openai/gpt-oss-20b` — Groq's Llama text models were
  retired from their catalog since this plan was written; gpt-oss-20b is the current
  fast/cheap/JSON-mode-capable equivalent (verify against `GET /openai/v1/models` if it drifts
  again).
- **Pipeline**: `apps/api/src/services/pipeline.ts` runs discovery → scrape → extract → store
  with bounded concurrency (3 pages at a time), basic dedup on business name, and per-page
  error isolation — one bad URL never kills the whole search.

