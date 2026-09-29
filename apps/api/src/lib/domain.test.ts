import { describe, expect, test } from "bun:test";
import { extractDomain } from "./domain";

describe("extractDomain", () => {
  test("extracts from a full URL", () => {
    expect(extractDomain("https://www.example.com/about")).toBe("example.com");
  });

  test("extracts from a bare domain (no protocol)", () => {
    expect(extractDomain("example.com")).toBe("example.com");
  });

  test("extracts from a domain with www but no protocol", () => {
    expect(extractDomain("www.example.com")).toBe("example.com");
  });

  test("extracts the domain part of an email address", () => {
    expect(extractDomain("info@example.com")).toBe("example.com");
  });

  test("normalizes to lowercase", () => {
    expect(extractDomain("HTTPS://WWW.Example.COM")).toBe("example.com");
  });

  test("returns null for an empty string", () => {
    expect(extractDomain("")).toBeNull();
  });

  test("returns null for garbage input with no TLD", () => {
    expect(extractDomain("not a url or email")).toBeNull();
  });

  test("returns null for a bare word with no dot", () => {
    expect(extractDomain("localhost")).toBeNull();
  });
});
