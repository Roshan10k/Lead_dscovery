import { describe, expect, test } from "bun:test";
import { isPlausibleEmail } from "./email";

describe("isPlausibleEmail", () => {
  test("accepts a well-formed email", () => {
    expect(isPlausibleEmail("info@example.com")).toBe(true);
  });

  test("rejects null/undefined", () => {
    expect(isPlausibleEmail(null)).toBe(false);
    expect(isPlausibleEmail(undefined)).toBe(false);
  });

  test("rejects an empty string", () => {
    expect(isPlausibleEmail("")).toBe(false);
  });

  test("rejects Cloudflare's obfuscation placeholder text — found live as an actual LLM extraction result", () => {
    expect(isPlausibleEmail("[email protected]")).toBe(false);
  });

  test("rejects a value with no @ at all", () => {
    expect(isPlausibleEmail("not an email")).toBe(false);
  });

  test("rejects a domain with no dot", () => {
    expect(isPlausibleEmail("info@localhost")).toBe(false);
  });

  test("rejects a value containing whitespace", () => {
    expect(isPlausibleEmail("info@example.com subject=hi")).toBe(false);
  });
});
