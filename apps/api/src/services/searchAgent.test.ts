import { describe, expect, test } from "bun:test";
import { planSearch } from "./searchAgent";
import type { CandidateUrl } from "../types";
import type { ChatCompletion, ChatCompletionCreateParamsNonStreaming } from "openai/resources/chat/completions";

// Builds a fake ChatCompletion carrying a single tool call, matching the
// minimal shape planSearch actually reads (choices[0].message.tool_calls[0]).
function toolCallCompletion(name: string, args: Record<string, unknown>): ChatCompletion {
  return {
    id: "fake",
    object: "chat.completion",
    created: 0,
    model: "fake",
    choices: [
      {
        index: 0,
        finish_reason: "tool_calls",
        logprobs: null,
        message: {
          role: "assistant",
          content: null,
          refusal: null,
          tool_calls: [
            { id: `call_${name}`, type: "function", function: { name, arguments: JSON.stringify(args) } },
          ],
        },
      },
    ],
  } as unknown as ChatCompletion;
}

function fakeCandidates(n: number): CandidateUrl[] {
  return Array.from({ length: n }, (_, i) => ({ url: `https://biz${i}.example`, title: `Business ${i}` }));
}

describe("planSearch", () => {
  test("finalizes after a single good try_search", async () => {
    const responses = [
      toolCallCompletion("try_search", { keyword: "yoga studios", location: "London" }),
      toolCallCompletion("finalize", { keyword: "yoga studios", location: "London", reason: "found several relevant studios" }),
    ];
    let call = 0;
    const createCompletion = async (_params: ChatCompletionCreateParamsNonStreaming) => responses[call++];
    const discover = async () => fakeCandidates(5);

    const result = await planSearch("yoga studios in London", new Set(), new Set(), discover, createCompletion);

    expect(result.keyword).toBe("yoga studios");
    expect(result.location).toBe("London");
    expect(result.steps).toHaveLength(1);
    expect(result.steps[0].candidateCount).toBe(5);
  });

  test("retries with an adjusted query when the first try_search finds nothing, then finalizes on the second", async () => {
    const responses = [
      toolCallCompletion("try_search", { keyword: "artisan bakeries", location: "Smalltown" }),
      toolCallCompletion("try_search", { keyword: "bakeries", location: "Smalltown, UK" }),
      toolCallCompletion("finalize", { keyword: "bakeries", location: "Smalltown, UK", reason: "broader term found real results" }),
    ];
    let call = 0;
    const discoverCalls: Array<[string, string]> = [];
    const createCompletion = async () => responses[call++];
    const discover = async (keyword: string, location: string) => {
      discoverCalls.push([keyword, location]);
      return discoverCalls.length === 1 ? fakeCandidates(0) : fakeCandidates(4);
    };

    const result = await planSearch("bakeries in a small town", new Set(), new Set(), discover, createCompletion);

    expect(result.keyword).toBe("bakeries");
    expect(result.location).toBe("Smalltown, UK");
    expect(result.steps).toHaveLength(2);
    expect(result.steps[0].candidateCount).toBe(0);
    expect(result.steps[1].candidateCount).toBe(4);
  });

  test("falls back to the best-performing step when the model never calls finalize within the attempt budget", async () => {
    // 3 try_search calls (the max), never finalize — forced tool_choice on
    // the final turn should make the model call finalize, but this
    // simulates it misbehaving anyway (e.g. malformed args).
    const responses = [
      toolCallCompletion("try_search", { keyword: "a", location: "X" }),
      toolCallCompletion("try_search", { keyword: "b", location: "X" }),
      toolCallCompletion("try_search", { keyword: "c", location: "X" }),
      toolCallCompletion("finalize", { keyword: "", location: "" }), // malformed — missing reason/empty fields
    ];
    let call = 0;
    const createCompletion = async () => responses[call++];
    const counts = [2, 7, 1];
    let discoverCall = 0;
    const discover = async () => fakeCandidates(counts[discoverCall++]);

    const result = await planSearch("something vague", new Set(), new Set(), discover, createCompletion);

    // "b" found the most candidates (7), so it should win the fallback.
    expect(result.keyword).toBe("b");
    expect(result.location).toBe("X");
    expect(result.steps).toHaveLength(3);
  });

  test("falls back to the raw goal text when the model never calls try_search at all", async () => {
    const createCompletion = async () =>
      ({
        id: "fake",
        object: "chat.completion",
        created: 0,
        model: "fake",
        choices: [{ index: 0, finish_reason: "stop", logprobs: null, message: { role: "assistant", content: "I'm not sure.", refusal: null } }],
      }) as unknown as ChatCompletion;
    const discover = async () => fakeCandidates(0);

    const result = await planSearch("something the model can't parse", new Set(), new Set(), discover, createCompletion);

    expect(result.keyword).toBe("something the model can't parse");
    expect(result.location).toBe("");
    expect(result.steps).toHaveLength(0);
  });

  test("skips a try_search call with missing keyword/location without crashing, and keeps going", async () => {
    const responses = [
      toolCallCompletion("try_search", { keyword: "", location: "" }), // malformed
      toolCallCompletion("try_search", { keyword: "plumbers", location: "Manchester" }),
      toolCallCompletion("finalize", { keyword: "plumbers", location: "Manchester", reason: "good results" }),
    ];
    let call = 0;
    const createCompletion = async () => responses[call++];
    let discoverCalls = 0;
    const discover = async () => {
      discoverCalls++;
      return fakeCandidates(6);
    };

    const result = await planSearch("plumbers somewhere", new Set(), new Set(), discover, createCompletion);

    expect(result.keyword).toBe("plumbers");
    expect(result.location).toBe("Manchester");
    // discover should only have been called once — the malformed attempt
    // never reached it.
    expect(discoverCalls).toBe(1);
    expect(result.steps).toHaveLength(1);
  });

  test("passes exclusion sets through to discover on every try_search", async () => {
    const responses = [
      toolCallCompletion("try_search", { keyword: "cafes", location: "Bristol" }),
      toolCallCompletion("finalize", { keyword: "cafes", location: "Bristol", reason: "ok" }),
    ];
    let call = 0;
    const createCompletion = async () => responses[call++];
    const received: { excludePlaceIds?: Set<string>; excludeDomains?: Set<string> } = {};
    const discover = async (
      _keyword: string,
      _location: string,
      excludePlaceIds: Set<string> = new Set(),
      excludeDomains: Set<string> = new Set()
    ) => {
      received.excludePlaceIds = excludePlaceIds;
      received.excludeDomains = excludeDomains;
      return fakeCandidates(3);
    };

    const excludePlaceIds = new Set(["place1"]);
    const excludeDomains = new Set(["seen.example"]);
    await planSearch("cafes in Bristol", excludePlaceIds, excludeDomains, discover, createCompletion);

    expect(received.excludePlaceIds).toBe(excludePlaceIds);
    expect(received.excludeDomains).toBe(excludeDomains);
  });
});
