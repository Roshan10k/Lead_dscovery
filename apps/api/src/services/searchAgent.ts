import OpenAI from "openai";
import type { ChatCompletionTool, ChatCompletion, ChatCompletionCreateParamsNonStreaming } from "openai/resources/chat/completions";
import { discoverCandidates } from "./discovery";
import type { SearchStep } from "../types";

type CreateCompletion = (params: ChatCompletionCreateParamsNonStreaming) => Promise<ChatCompletion>;

// Bounds the agent's planning loop — each attempt costs one real Serper
// request (see PROBE_CANDIDATES below), so this caps worst-case discovery
// cost at MAX_ATTEMPTS extra credits on top of the one full discovery call
// the pipeline makes once a query is finalized.
const MAX_ATTEMPTS = 3;

// Small on purpose: while planning, the agent only needs to know roughly how
// many real candidates a query surfaces, not the full candidate set — a
// cheap probe, not the real discovery call. Keeping this small also keeps
// each probe to a single Serper page in the common case (no pagination),
// see discovery.ts's MAX_PAGES for what an unbounded version would cost.
const PROBE_CANDIDATES = 3;

export interface PlannedSearch {
  keyword: string;
  location: string;
  steps: SearchStep[];
}

// The OpenAI SDK's default timeout (10 minutes) is far longer than any user
// will wait — bounds one call's worst case rather than leaving it unbounded.
// Matters more here than a single extraction call: a slow/hung turn can
// happen up to MAX_TURNS times in the planning loop below.
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

const SYSTEM_PROMPT = `You plan Google Places searches for a lead-generation tool, given a user's goal in plain language.

Your job: pick a business keyword (the kind of business to search for, e.g. "boutique gyms", "commercial cleaning companies") and a location, then test it with try_search. try_search tells you how many distinct real, not-already-seen businesses that exact query found, plus a few sample names.

Judge the result:
- 0-1 candidates, or sample names that clearly aren't what the user is looking for: the query is bad. Try again with a different keyword (broader/narrower/synonym) or location (wider area, different spelling).
- A handful of relevant-looking candidates: good enough. Call finalize.

You have at most ${MAX_ATTEMPTS} tries at try_search. Always end by calling finalize with the best keyword+location you found and a one-sentence reason. Never call finalize before at least one try_search.`;

const TOOLS: ChatCompletionTool[] = [
  {
    type: "function",
    function: {
      name: "try_search",
      description: "Test a keyword+location query and see how many real, relevant businesses it finds.",
      parameters: {
        type: "object",
        properties: {
          keyword: { type: "string", description: "The kind of business to search for, e.g. 'boutique gyms'" },
          location: { type: "string", description: "A city, region, or country, e.g. 'London'" },
        },
        required: ["keyword", "location"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "finalize",
      description: "Commit to the best keyword+location query tried so far.",
      parameters: {
        type: "object",
        properties: {
          keyword: { type: "string" },
          location: { type: "string" },
          reason: { type: "string", description: "One sentence explaining why this query is a good fit for the goal." },
        },
        required: ["keyword", "location", "reason"],
      },
    },
  },
];

/**
 * Turns a free-text goal ("boutique gyms in London that might want a new
 * website") into a concrete keyword+location query, via a bounded
 * tool-calling loop: the agent proposes a query, tests it cheaply with
 * try_search, and — if the results look thin or off-target — tries again
 * with an adjusted query, up to MAX_ATTEMPTS times. This is a genuine agent
 * decision (retry or not, and how to adjust) rather than a fixed rule,
 * unlike the multi-page email fallback (see contactFinder.ts) — there's no
 * cheap deterministic way to judge "are these results actually relevant to
 * what the user described".
 *
 * Always returns a usable query, even if the model never calls finalize or
 * every attempt looks weak: falls back to the best (highest candidateCount)
 * step tried, so a planning hiccup degrades to "an okay search" rather than
 * a failed one.
 */
export async function planSearch(
  goal: string,
  excludePlaceIds: Set<string> = new Set(),
  excludeDomains: Set<string> = new Set(),
  discover: typeof discoverCandidates = discoverCandidates,
  createCompletion: CreateCompletion = (params) => getClient().chat.completions.create(params)
): Promise<PlannedSearch> {
  const steps: SearchStep[] = [];
  const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
    { role: "system", content: SYSTEM_PROMPT },
    { role: "user", content: goal },
  ];

  // Bounded by turns, not just try_search calls, so a model that repeatedly
  // sends malformed args can't loop forever either.
  //
  // tool_choice is "required" ONLY on the very first turn, then "auto" for
  // the rest — found live that this model reliably honors "required" before
  // any tool result is in context, but once the conversation has a tool
  // result in it, forcing a tool call (whether "required" or a specific
  // named function) unreliably makes it answer in plain prose instead and
  // the API call fails outright. Rather than fight that, "auto" is used
  // afterward and a plain-text reply is treated as the model deciding it's
  // done — the loop then falls through to the deterministic best-step
  // fallback below, same as if finalize had been called with nothing to add.
  const MAX_TURNS = MAX_ATTEMPTS * 2 + 1;
  for (let turn = 0; turn < MAX_TURNS; turn++) {
    let completion: Awaited<ReturnType<CreateCompletion>>;
    try {
      completion = await createCompletion({
        model: process.env.GROQ_MODEL ?? "openai/gpt-oss-20b",
        temperature: 0,
        messages,
        tools: TOOLS,
        tool_choice: turn === 0 ? "required" : "auto",
      });
    } catch {
      // Seen live: under "auto", the model can hallucinate a tool name that
      // isn't in the tool list (e.g. blending "try_search"+"finalize" into
      // "try_finalize"), which the API rejects outright. Treat that the
      // same as "the model didn't produce a usable tool call" — fall
      // through to the deterministic fallback below rather than failing
      // the whole search over one bad turn.
      break;
    }

    const message = completion.choices[0]?.message;
    const toolCall = message?.tool_calls?.[0];
    if (!message || !toolCall || toolCall.type !== "function") break;

    messages.push(message);

    if (toolCall.function.name === "finalize") {
      const args = safeParseArgs(toolCall.function.arguments);
      if (args?.keyword && args?.location) {
        return { keyword: String(args.keyword), location: String(args.location), steps };
      }
      break; // malformed finalize call — fall through to the deterministic fallback
    }

    // try_search
    const args = safeParseArgs(toolCall.function.arguments);
    const keyword = String(args?.keyword ?? "").trim();
    const location = String(args?.location ?? "").trim();
    if (!keyword || !location) {
      messages.push({
        role: "tool",
        tool_call_id: toolCall.id,
        content: JSON.stringify({ error: "keyword and location are both required" }),
      });
      continue;
    }

    if (steps.length >= MAX_ATTEMPTS) {
      messages.push({
        role: "tool",
        tool_call_id: toolCall.id,
        content: JSON.stringify({ error: "attempt budget used up — call finalize now with your best query so far" }),
      });
      continue;
    }

    const candidates = await discover(keyword, location, excludePlaceIds, excludeDomains, PROBE_CANDIDATES);
    const sampleNames = candidates.slice(0, 3).map((c) => c.knownBusinessName ?? c.title ?? c.url);
    const step: SearchStep = {
      keyword,
      location,
      candidateCount: candidates.length,
      verdict: candidates.length > 0 ? `found ${candidates.length}, e.g. ${sampleNames.join(", ")}` : "found none",
    };
    steps.push(step);

    messages.push({
      role: "tool",
      tool_call_id: toolCall.id,
      content: JSON.stringify({ candidateCount: candidates.length, sampleNames }),
    });
  }

  // The model never called finalize (or called it badly) within the budget
  // — fall back to whichever attempted query performed best, rather than
  // failing the search outright.
  if (steps.length === 0) {
    // No try_search calls happened at all (a completely broken first turn) —
    // last resort: search the raw goal text itself as the keyword.
    return { keyword: goal, location: "", steps };
  }
  const best = steps.reduce((a, b) => (b.candidateCount > a.candidateCount ? b : a));
  return { keyword: best.keyword, location: best.location, steps };
}

function safeParseArgs(json: string): Record<string, unknown> | null {
  try {
    return JSON.parse(json);
  } catch {
    return null;
  }
}
