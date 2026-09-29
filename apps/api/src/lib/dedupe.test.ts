import { describe, expect, test } from "bun:test";
import { normalizeDedupeKey } from "./dedupe";

describe("normalizeDedupeKey", () => {
  test("trims and lowercases", () => {
    expect(normalizeDedupeKey("  Clean Co  ")).toBe("clean co");
  });

  test("two differently-cased/whitespaced names collide to the same key", () => {
    expect(normalizeDedupeKey("Clean Co")).toBe(normalizeDedupeKey(" CLEAN CO "));
  });

  test("distinct names produce distinct keys", () => {
    expect(normalizeDedupeKey("Clean Co")).not.toBe(normalizeDedupeKey("Clean Co Sydney"));
  });

  test("strips a trailing legal suffix so 'Clean Co' and 'Clean Co Ltd' collide", () => {
    expect(normalizeDedupeKey("Clean Co Ltd")).toBe(normalizeDedupeKey("Clean Co"));
  });

  test("strips a trailing legal suffix with a period", () => {
    expect(normalizeDedupeKey("Clean Co Ltd.")).toBe(normalizeDedupeKey("Clean Co"));
  });

  test("strips a trailing legal suffix preceded by a comma", () => {
    expect(normalizeDedupeKey("Clean Co, Ltd")).toBe(normalizeDedupeKey("Clean Co"));
  });

  test("strips a compounded suffix (e.g. Australian 'Pty Ltd')", () => {
    expect(normalizeDedupeKey("Clean Co Pty Ltd")).toBe(normalizeDedupeKey("Clean Co"));
  });

  test("covers other common legal suffixes: LLC, Inc, Corp, PLC, LLP", () => {
    expect(normalizeDedupeKey("Acme LLC")).toBe(normalizeDedupeKey("Acme"));
    expect(normalizeDedupeKey("Acme Inc")).toBe(normalizeDedupeKey("Acme"));
    expect(normalizeDedupeKey("Acme Corp")).toBe(normalizeDedupeKey("Acme"));
    expect(normalizeDedupeKey("Acme PLC")).toBe(normalizeDedupeKey("Acme"));
    expect(normalizeDedupeKey("Acme LLP")).toBe(normalizeDedupeKey("Acme"));
  });

  test("does NOT strip 'co' or 'company' as a suffix — often the actual brand word, not a legal marker", () => {
    expect(normalizeDedupeKey("Clean Co")).not.toBe(normalizeDedupeKey("Clean"));
    expect(normalizeDedupeKey("Acme Company")).not.toBe(normalizeDedupeKey("Acme"));
  });

  test("does NOT strip a legal-suffix-like word that isn't trailing", () => {
    // A business literally named this way shouldn't be mangled just because
    // "incorporated" appears in it — only a genuinely trailing suffix is stripped.
    expect(normalizeDedupeKey("Incorporated Builders")).toBe("incorporated builders");
  });

  test("strips punctuation, including apostrophes, so 'Mike's' and 'Mikes' collide", () => {
    expect(normalizeDedupeKey("Mike's Electrical")).toBe(normalizeDedupeKey("Mikes Electrical"));
  });

  test("collapses an ampersand to whitespace rather than leaving it embedded", () => {
    expect(normalizeDedupeKey("Smith & Sons")).toBe("smith sons");
  });
});
