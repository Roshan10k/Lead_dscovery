import { eq, and } from "drizzle-orm";
import OpenAI from "openai";
import { z } from "zod";
import type { ChatCompletion, ChatCompletionCreateParamsNonStreaming } from "openai/resources/chat/completions";
import { db } from "../db/client";
import { leads, leadQualifications, qualificationJobs, type Lead } from "../db/schema";

type CreateCompletion = (params: ChatCompletionCreateParamsNonStreaming) => Promise<ChatCompletion>;

const CONCURRENCY = 3;

// Same reasoning as extract.ts/searchAgent.ts — the SDK's default 10-minute
// timeout is far longer than any user will wait for one lead's judgment.
const GROQ_TIMEOUT_MS = 30_000;

let client: OpenAI | null = null;
function getClient(): OpenAI {
  if (!client) {
    if (!process.env.GROQ_API_KEY) {
      throw new Error("GROQ_API_KEY is not set. Copy .env.example to .env and fill it in.");
    }
    client = new OpenAI({
      apiKey: process.env.GROQ_API_KEY,
      baseURL: process.env.GROQ_BASE_URL ?? "https://api.groq.com/openai/v1",
      timeout: GROQ_TIMEOUT_MS,
    });
  }
  return client;
}

export const qualificationSchema = z.object({
  fitScore: z.enum(["strong_fit", "possible_fit", "poor_fit"]),
  reasoning: z.string(),
});

export type Qualification = z.infer<typeof qualificationSchema>;

/** Normalizes offering text into a cache key — same exact-match philosophy as dedupe.ts. */
export function normalizeOffering(offering: string): string {
  return offering.trim().toLowerCase();
}

const SYSTEM_PROMPT = `You judge whether a business is a good sales lead for a specific offering, based only on the facts given about it. Never invent details you weren't given — e.g. don't claim their website "looks outdated" if you were only told whether one exists.

Score:
- "strong_fit": the business's situation clearly matches a real need for the offering (e.g. an offering about building websites, and the business has no website at all).
- "possible_fit": plausible, but the given facts don't clearly confirm or rule it out.
- "poor_fit": the business already appears to have this covered, or the offering doesn't plausibly apply to a business like this.

Return ONLY a JSON object, no prose, no markdown fences:
{"fitScore": "strong_fit" | "possible_fit" | "poor_fit", "reasoning": string}
reasoning is one sentence, grounded only in the facts given.`;

type LeadFacts = Pick<Lead, "businessName" | "description" | "location" | "website" | "email" | "phone" | "socialLinks">;

function summarizeLeadFacts(lead: LeadFacts): string {
  const socials = Object.keys(lead.socialLinks ?? {});
  return [
    `Business name: ${lead.businessName}`,
    lead.location ? `Location: ${lead.location}` : null,
    `Description: ${lead.description ?? "(none available)"}`,
    `Has a website: ${lead.website ? "yes" : "no"}`,
    `Has a public email listed: ${lead.email ? "yes" : "no"}`,
    `Has a phone number listed: ${lead.phone ? "yes" : "no"}`,
    `Social media presence: ${socials.length ? socials.join(", ") : "none found"}`,
  ]
    .filter((line): line is string => line !== null)
    .join("\n");
}

/**
 * Judges one lead's fit for a given offering — a single structured-reasoning
 * call, not a tool-calling loop like searchAgent.ts, because there's no
 * multi-step decision here: everything the judgment needs (the offering, the
 * lead's already-scraped facts) is already in hand. Returns null (rather
 * than throwing) on any failure — a bad LLM response for one lead shouldn't
 * take down a whole qualification batch, same philosophy as extractLead.
 */
export async function qualifyLead(
  lead: LeadFacts,
  offering: string,
  createCompletion: CreateCompletion = (params) => getClient().chat.completions.create(params)
): Promise<Qualification | null> {
  try {
    const completion = await createCompletion({
      model: process.env.GROQ_MODEL ?? "openai/gpt-oss-20b",
      temperature: 0,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: `Offering: ${offering}\n\nBusiness facts:\n${summarizeLeadFacts(lead)}` },
      ],
    });

    const raw = completion.choices[0]?.message?.content;
    if (!raw) return null;

    const parsed = qualificationSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

/**
 * Runs a batch qualification job in the background (fire-and-forget from the
 * route handler, same pattern as pipeline.ts's runSearchPipeline) — one LLM
 * call per lead is too slow to do inline in a single HTTP request.
 *
 * Skips any lead already qualified for the exact same offering text (see
 * leadQualifications' unique index) rather than re-calling the LLM — the
 * same "don't pay twice for the same answer" reasoning as the page cache,
 * and what lets a user re-run qualification over a growing lead pool
 * without re-judging leads it's already judged for that offering.
 */
export async function runQualificationJob(jobId: string, offering: string, leadIds: string[]) {
  try {
    await db.update(qualificationJobs).set({ status: "processing" }).where(eq(qualificationJobs.id, jobId));

    const offeringKey = normalizeOffering(offering);
    let processed = 0;
    let cursor = 0;

    async function worker() {
      while (cursor < leadIds.length) {
        const leadId = leadIds[cursor++];

        const [existing] = await db
          .select({ id: leadQualifications.id })
          .from(leadQualifications)
          .where(and(eq(leadQualifications.leadId, leadId), eq(leadQualifications.offeringKey, offeringKey)));

        if (!existing) {
          const [lead] = await db.select().from(leads).where(eq(leads.id, leadId));
          if (lead) {
            const result = await qualifyLead(lead, offering);
            if (result) {
              await db
                .insert(leadQualifications)
                .values({
                  leadId,
                  offeringKey,
                  offering,
                  fitScore: result.fitScore,
                  reasoning: result.reasoning,
                })
                .onConflictDoNothing();
            }
          }
        }

        processed++;
        await db.update(qualificationJobs).set({ processedCount: processed }).where(eq(qualificationJobs.id, jobId));
      }
    }

    await Promise.all(Array.from({ length: Math.min(CONCURRENCY, leadIds.length) }, worker));

    await db
      .update(qualificationJobs)
      .set({ status: "completed", completedAt: new Date() })
      .where(eq(qualificationJobs.id, jobId));
  } catch (err) {
    await db
      .update(qualificationJobs)
      .set({
        status: "failed",
        errorMessage: err instanceof Error ? err.message : "Unknown error",
        completedAt: new Date(),
      })
      .where(eq(qualificationJobs.id, jobId));
  }
}
