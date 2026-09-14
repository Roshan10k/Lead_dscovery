import { describe, expect, test } from "bun:test";
import { leadSchema, emailDescSchema } from "./extract";

describe("leadSchema (full extraction, DuckDuckGo path)", () => {
  test("accepts a well-formed business listing", () => {
    const result = leadSchema.safeParse({
      isBusinessListing: true,
      businessName: "Clean Co",
      location: "Sydney NSW",
      phone: "+61 2 9189 4164",
      email: "info@clean-co.com.au",
      website: "https://commercial-cleaning.com.au",
      description: "Commercial cleaning in Sydney.",
    });
    expect(result.success).toBe(true);
  });

  test("accepts nulls for missing fields", () => {
    const result = leadSchema.safeParse({
      isBusinessListing: true,
      businessName: "Clean Co",
      location: null,
      phone: null,
      email: null,
      website: null,
      description: null,
    });
    expect(result.success).toBe(true);
  });

  test("rejects a payload missing required keys — this is what makes malformed LLM output a no-op page skip, not a crash", () => {
    const result = leadSchema.safeParse({ businessName: "Clean Co" });
    expect(result.success).toBe(false);
  });

  test("rejects wrong types (e.g. isBusinessListing as a string, a plausible LLM slip)", () => {
    const result = leadSchema.safeParse({
      isBusinessListing: "true",
      businessName: "Clean Co",
      location: null,
      phone: null,
      email: null,
      website: null,
      description: null,
    });
    expect(result.success).toBe(false);
  });

  test("non-business pages parse but are identifiable as non-listings via isBusinessListing:false", () => {
    const result = leadSchema.safeParse({
      isBusinessListing: false,
      businessName: null,
      location: null,
      phone: null,
      email: null,
      website: null,
      description: null,
    });
    expect(result.success).toBe(true);
    expect(result.success && result.data.isBusinessListing).toBe(false);
  });
});

describe("emailDescSchema (Places path — email/description only)", () => {
  test("accepts an email and description", () => {
    const result = emailDescSchema.safeParse({
      email: "info@clean-co.com.au",
      description: "Commercial cleaning in Sydney.",
    });
    expect(result.success).toBe(true);
  });

  test("accepts nulls when nothing was found on the page", () => {
    const result = emailDescSchema.safeParse({ email: null, description: null });
    expect(result.success).toBe(true);
  });

  test("rejects a non-JSON-shaped / garbage payload", () => {
    const result = emailDescSchema.safeParse("not an object");
    expect(result.success).toBe(false);
  });
});
