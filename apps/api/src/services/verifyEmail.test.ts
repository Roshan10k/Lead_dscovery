import { describe, expect, test } from "bun:test";
import { verifyEmailDomain, type DnsLookup } from "./verifyEmail";

function dnsError(code: string): NodeJS.ErrnoException {
  const err = new Error(code) as NodeJS.ErrnoException;
  err.code = code;
  return err;
}

describe("verifyEmailDomain", () => {
  test("returns true when the domain has an MX record", async () => {
    const dnsLookup: DnsLookup = {
      resolveMx: async () => [{ exchange: "mail.example.com", priority: 10 }],
      resolve4: async () => {
        throw new Error("should not be called — MX already found");
      },
    };
    const result = await verifyEmailDomain("info@example.com", dnsLookup);
    expect(result).toBe(true);
  });

  test("falls back to an A record when there's no MX record", async () => {
    const dnsLookup: DnsLookup = {
      resolveMx: async () => {
        throw dnsError("ENOTFOUND");
      },
      resolve4: async () => ["93.184.216.34"],
    };
    const result = await verifyEmailDomain("info@example.com", dnsLookup);
    expect(result).toBe(true);
  });

  test("returns false when neither MX nor A records exist — a genuinely dead domain", async () => {
    const dnsLookup: DnsLookup = {
      resolveMx: async () => {
        throw dnsError("ENOTFOUND");
      },
      resolve4: async () => {
        throw dnsError("ENOTFOUND");
      },
    };
    const result = await verifyEmailDomain("info@totally-made-up-zzz.example", dnsLookup);
    expect(result).toBe(false);
  });

  test("returns null (not false) on a transient DNS failure — distinct from a confirmed-dead domain", async () => {
    const dnsLookup: DnsLookup = {
      resolveMx: async () => {
        throw dnsError("ESERVFAIL");
      },
      resolve4: async () => {
        throw dnsError("ESERVFAIL");
      },
    };
    const result = await verifyEmailDomain("info@example.com", dnsLookup);
    expect(result).toBeNull();
  });

  test("returns null (not false) when the MX lookup times out", async () => {
    const dnsLookup: DnsLookup = {
      resolveMx: () => new Promise(() => {}), // never resolves
      resolve4: async () => {
        throw new Error("should not be reached within the test timeout");
      },
    };
    const result = await verifyEmailDomain("info@example.com", dnsLookup, 50);
    expect(result).toBeNull();
  });

  test("returns null for an unparseable email rather than false", async () => {
    const dnsLookup: DnsLookup = {
      resolveMx: async () => {
        throw new Error("should not be called — email has no valid domain to look up");
      },
      resolve4: async () => {
        throw new Error("should not be called");
      },
    };
    const result = await verifyEmailDomain("not-an-email", dnsLookup);
    expect(result).toBeNull();
  });
});
