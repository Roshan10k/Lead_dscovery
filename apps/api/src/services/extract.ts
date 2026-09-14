import OpenAI from "openai";
import { z } from "zod";
import type { ScrapedPage } from "./scrape";
import type { ExtractedLead } from "../types";

export const leadSchema = z.object({
  isBusinessListing: z.boolean(),
  businessName: z.string().nullable(),
  location: z.string().nullable(),
  phone: z.string().nullable(),
  email: z.string().nullable(),
  website: z.string().nullable(),
  description: z.string().nullable(),
});

let client: OpenAI | null = null;
function getClient(): OpenAI {
  if (!client) {
    if (!process.env.GROQ_API_KEY) {
      throw new Error("GROQ_API_KEY is not set. Copy .env.example to .env and fill it in.");
    }
    client = new OpenAI({
      apiKey: process.env.GROQ_API_KEY,
      baseURL: process.env.GROQ_BASE_URL ?? "https://api.groq.com/openai/v1",
    });
  }
  return client;
}

const SYSTEM_PROMPT = `You extract structured business contact information from raw webpage text.
Return ONLY a JSON object matching this shape, no prose, no markdown fences:
{
  "isBusinessListing": boolean,   // true only if this page is actually about a specific business
  "businessName": string | null,
  "location": string | null,      // city/region/address if mentioned
  "phone": string | null,
  "email": string | null,
  "website": string | null,       // the business's own site, if different from the source page
  "description": string | null    // one short sentence describing the business
}
If a field is not present in the text, use null. Never invent information.
If the page is not about a specific business (e.g. it's a directory listing many businesses,
a news article, or unrelated content), set isBusinessListing to false and use null for the rest.`;

/**
 * Sends scraped page text to the LLM and returns a validated lead, or null if
 * the page wasn't a usable business listing, the LLM call failed, or the
 * response didn't match the expected schema.
 */
export async function extractLead(page: ScrapedPage): Promise<ExtractedLead | null> {
  try {
    const completion = await getClient().chat.completions.create({
      model: process.env.GROQ_MODEL ?? "openai/gpt-oss-20b",
      temperature: 0,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        {
          role: "user",
          content: `Page title: ${page.title}\nPage URL: ${page.url}\n\nPage text:\n${page.text}`,
        },
      ],
    });

    const raw = completion.choices[0]?.message?.content;
    if (!raw) return null;

    const parsed = leadSchema.safeParse(JSON.parse(raw));
    if (!parsed.success || !parsed.data.isBusinessListing || !parsed.data.businessName) {
      return null;
    }

    const { isBusinessListing: _drop, businessName, ...rest } = parsed.data;
    return { businessName, ...rest };
  } catch {
    // Bad/invalid LLM output for a single page should never take down the whole search.
    return null;
  }
}

export const emailDescSchema = z.object({
  email: z.string().nullable(),
  description: z.string().nullable(),
});

const EMAIL_DESC_SYSTEM_PROMPT = `You are given the text of a business's own website. Extract only:
{
  "email": string | null,      // a contact email address, if present in the text
  "description": string | null // one short sentence describing what the business does
}
Return ONLY the JSON object, no prose, no markdown fences. If no email is present, use null. Never invent an email.`;

/**
 * Used for candidates that already came from a structured discovery source
 * (Serper Places) with a known business identity — we don't need the LLM to
 * judge whether the page is a business listing, only to pull out an email
 * and short description from the business's own site, which Maps data
 * doesn't include.
 */
export async function extractEmailAndDescription(
  page: ScrapedPage
): Promise<{ email: string | null; description: string | null } | null> {
  try {
    const completion = await getClient().chat.completions.create({
      model: process.env.GROQ_MODEL ?? "openai/gpt-oss-20b",
      temperature: 0,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: EMAIL_DESC_SYSTEM_PROMPT },
        {
          role: "user",
          content: `Page title: ${page.title}\nPage URL: ${page.url}\n\nPage text:\n${page.text}`,
        },
      ],
    });

    const raw = completion.choices[0]?.message?.content;
    if (!raw) return null;

    const parsed = emailDescSchema.safeParse(JSON.parse(raw));
    if (!parsed.success) return null;
    return parsed.data;
  } catch {
    return null;
  }
}
