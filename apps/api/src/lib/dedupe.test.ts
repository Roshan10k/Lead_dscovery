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
});
