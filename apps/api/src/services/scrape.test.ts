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
      if (url.pathname === "/with-social") {
        return new Response(
          `<html><head><title>Clean Co</title></head><body>
            <nav>
              <a href="https://www.facebook.com/sharer/sharer.php?u=x">Share</a>
            </nav>
            Contact us: info@clean-co.example
            <footer>
              <a href="https://www.facebook.com/cleanco">Facebook</a>
              <a href="https://instagram.com/cleanco/">Instagram</a>
              <a href="https://www.linkedin.com/company/cleanco">LinkedIn</a>
              <a href="https://x.com/cleanco">X</a>
              <a href="https://facebook.com/policies/cookies">Cookie policy</a>
            </footer>
          </body></html>`,
          { headers: { "content-type": "text/html" } }
        );
      }
      if (url.pathname === "/no-social") {
        return new Response(
          `<html><head><title>Clean Co</title></head><body>No social links here.</body></html>`,
          { headers: { "content-type": "text/html" } }
        );
      }
      if (url.pathname === "/mailto-icon-only") {
        return new Response(
          `<html><head><title>Clean Co</title></head><body>
            Welcome to Clean Co.
            <a href="mailto:hello@clean-co.example?subject=Hi"><svg>envelope icon</svg></a>
          </body></html>`,
          { headers: { "content-type": "text/html" } }
        );
      }
      if (url.pathname === "/mailto-malformed") {
        return new Response(
          `<html><head><title>Clean Co</title></head><body>
            Welcome to Clean Co.
            <a href="mailto:contact@clean-co.example subject=complaints">Email us</a>
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

describe("scrapePage social link extraction", () => {
  test("extracts social links from the footer, which script/nav/footer text-stripping would otherwise remove first", async () => {
    const page = await scrapePage(`${server.url}with-social`);
    expect(page?.socialLinks.facebook).toBe("https://www.facebook.com/cleanco");
    expect(page?.socialLinks.instagram).toBe("https://instagram.com/cleanco/");
    expect(page?.socialLinks.linkedin).toBe("https://www.linkedin.com/company/cleanco");
    expect(page?.socialLinks.twitter).toBe("https://x.com/cleanco");
  });

  test("excludes utility paths (share dialogs, policy pages) rather than mistaking them for a profile link", async () => {
    const page = await scrapePage(`${server.url}with-social`);
    // The sharer.php link in <nav> and the /policies/ link in <footer> must
    // not overwrite the real facebook.com/cleanco profile link.
    expect(page?.socialLinks.facebook).toBe("https://www.facebook.com/cleanco");
  });

  test("returns an empty object when a page has no social links, not undefined/null", async () => {
    const page = await scrapePage(`${server.url}no-social`);
    expect(page?.socialLinks).toEqual({});
  });
});

describe("scrapePage mailto email extraction", () => {
  test("extracts an email from an icon-only mailto: link with no visible email text", async () => {
    const page = await scrapePage(`${server.url}mailto-icon-only`);
    expect(page).not.toBeNull();
    expect(page!.text).not.toContain("@"); // no visible email text — icon-only button
    expect(page?.mailtoEmail).toBe("hello@clean-co.example");
  });

  test("returns null when a page has no mailto: link", async () => {
    const page = await scrapePage(`${server.url}no-social`);
    expect(page?.mailtoEmail).toBeNull();
  });

  test("strips a malformed query string (space instead of '?') rather than leaking it into the email — found live against a real site", async () => {
    const page = await scrapePage(`${server.url}mailto-malformed`);
    expect(page?.mailtoEmail).toBe("contact@clean-co.example");
  });
});
