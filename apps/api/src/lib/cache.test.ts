import { describe, expect, test } from "bun:test";
import { getCached, setCached } from "./cache";

// Requires a reachable Postgres (docker compose up) since the cache is
// backed by the page_cache table, not an in-memory store.
describe("page cache", () => {
  test("a miss for a never-cached URL returns hit:false", async () => {
    const result = await getCached(`https://example.com/never-cached-${Date.now()}`, "full");
    expect(result.hit).toBe(false);
  });

  test("set then get round-trips the payload", async () => {
    const url = `https://example.com/roundtrip-${Date.now()}`;
    const payload = { email: "info@example.com", description: "A test business." };
    await setCached(url, "contact_details", payload);

    const result = await getCached<typeof payload>(url, "contact_details");
    expect(result.hit).toBe(true);
    expect(result.hit && result.payload).toEqual(payload);
  });

  test("caching a null payload (confirmed negative result) round-trips as hit:true with payload:null", async () => {
    const url = `https://example.com/negative-${Date.now()}`;
    await setCached(url, "full", null);

    const result = await getCached(url, "full");
    expect(result.hit).toBe(true);
    expect(result.hit && result.payload).toBeNull();
  });

  test("the same URL under a different kind is cached independently", async () => {
    const url = `https://example.com/kinds-${Date.now()}`;
    await setCached(url, "full", { businessName: "A" });
    await setCached(url, "contact_details", { email: "a@a.com" });

    const full = await getCached<{ businessName: string }>(url, "full");
    const contact = await getCached<{ email: string }>(url, "contact_details");
    expect(full.hit && full.payload?.businessName).toBe("A");
    expect(contact.hit && contact.payload?.email).toBe("a@a.com");
  });

  test("setCached on an existing key overwrites rather than duplicates", async () => {
    const url = `https://example.com/overwrite-${Date.now()}`;
    await setCached(url, "full", { businessName: "Old" });
    await setCached(url, "full", { businessName: "New" });

    const result = await getCached<{ businessName: string }>(url, "full");
    expect(result.hit && result.payload?.businessName).toBe("New");
  });
});
