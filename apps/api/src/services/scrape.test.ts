import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { scrapePage } from "./scrape";

// A local test server, rather than hitting a real external site, so this
// test is deterministic and doesn't depend on network conditions or a third
// party's page staying online/unchanged.
let server: ReturnType<typeof Bun.serve>;

beforeAll(() => {
  server = Bun.serve({
    port: 0,
    fetch(req) {
      const url = new URL(req.url);
      if (url.pathname === "/business") {
        return new Response(
          `<html><head><title>Clean Co</title></head><body>
            <script>console.log("should be stripped")</script>
            <nav>nav should be stripped</nav>
            Contact us: info@clean-co.example
          </body></html>`,
          { headers: { "content-type": "text/html" } }
        );
      }
      if (url.pathname === "/not-found") {
        return new Response("nope", { status: 404 });
      }
      if (url.pathname === "/json") {
        return new Response(JSON.stringify({ ok: true }), {
          headers: { "content-type": "application/json" },
        });
      }
      return new Response("not found", { status: 404 });
    },
  });
});

afterAll(() => {
  server.stop(true);
});

describe("scrapePage", () => {
  test("extracts title and visible text, stripping script/nav content", async () => {
    const page = await scrapePage(`${server.url}business`);
    expect(page).not.toBeNull();
    expect(page?.title).toBe("Clean Co");
    expect(page?.text).toContain("info@clean-co.example");
    expect(page?.text).not.toContain("should be stripped");
  });

  test("returns null for a failed page (404) rather than throwing — one bad URL must not crash the whole search", async () => {
    const page = await scrapePage(`${server.url}not-found`);
    expect(page).toBeNull();
  });

  test("returns null for non-HTML content types", async () => {
    const page = await scrapePage(`${server.url}json`);
    expect(page).toBeNull();
  });

  test("returns null for an unreachable host rather than throwing", async () => {
    const page = await scrapePage("http://localhost:1/unreachable");
    expect(page).toBeNull();
  });
});
