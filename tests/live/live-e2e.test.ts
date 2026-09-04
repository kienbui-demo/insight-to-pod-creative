import { beforeAll, describe, expect, it } from "vitest";

import type { CrawlSource, TrendCard, UiEvent } from "../../packages/contracts";
import { handleBffRequest } from "../../src/bff/router";
import type { BffRequest, BffRequestContext } from "../../src/bff/types";
import { buildLiveDependencies } from "../../src/integration/live-dependencies";

const CRAWL_SOURCES = new Set<CrawlSource>([
  "google_trends",
  "reddit",
  "pinterest",
  "tiktok",
  "amazon",
  "etsy",
  "meta_ads",
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isCrawlSource(value: unknown): value is CrawlSource {
  return typeof value === "string" && CRAWL_SOURCES.has(value as CrawlSource);
}

function isTrendCard(value: unknown): value is TrendCard {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    typeof value.market === "string" &&
    typeof value.seed === "string" &&
    (value.productType === undefined || typeof value.productType === "string") &&
    typeof value.opportunityScore === "number" &&
    typeof value.confidence === "number" &&
    Array.isArray(value.availableSources) &&
    value.availableSources.every(isCrawlSource) &&
    Array.isArray(value.missingSources) &&
    value.missingSources.every(isCrawlSource) &&
    Array.isArray(value.trendSeries) &&
    value.trendSeries.every(
      (point) =>
        isRecord(point) &&
        typeof point.t === "string" &&
        typeof point.v === "number",
    ) &&
    Array.isArray(value.referenceImages) &&
    value.referenceImages.every((url) => typeof url === "string") &&
    (value.competitors === undefined ||
      (Array.isArray(value.competitors) &&
        value.competitors.every(
          (competitor) =>
            isRecord(competitor) &&
            typeof competitor.title === "string" &&
            (competitor.price === undefined ||
              typeof competitor.price === "number") &&
            (competitor.adActive === undefined ||
              typeof competitor.adActive === "boolean"),
        ))) &&
    isRecord(value.recommendation) &&
    typeof value.recommendation.action === "string" &&
    typeof value.recommendation.reasoning === "string" &&
    (value.freshnessTier === "hot" ||
      value.freshnessTier === "warm" ||
      value.freshnessTier === "cold") &&
    typeof value.updatedAt === "string"
  );
}

function parseUiEvent(payload: string): UiEvent {
  const value: unknown = JSON.parse(payload);
  if (!isRecord(value) || typeof value.id !== "string") {
    throw new Error("Live SSE payload is not a UiEvent");
  }

  switch (value.type) {
    case "scanning":
      if (isCrawlSource(value.source)) {
        return { id: value.id, type: "scanning", source: value.source };
      }
      break;
    case "synthesizing":
      if (value.note === undefined || typeof value.note === "string") {
        return value.note === undefined
          ? { id: value.id, type: "synthesizing" }
          : { id: value.id, type: "synthesizing", note: value.note };
      }
      break;
    case "image:ready":
      if (typeof value.url === "string") {
        return { id: value.id, type: "image:ready", url: value.url };
      }
      break;
    case "card:ready":
      if (isTrendCard(value.card)) {
        return { id: value.id, type: "card:ready", card: value.card };
      }
      break;
    case "answer":
      if (typeof value.text === "string") {
        return { id: value.id, type: "answer", text: value.text };
      }
      break;
    case "error":
      if (
        typeof value.recoverable === "boolean" &&
        typeof value.message === "string"
      ) {
        return {
          id: value.id,
          type: "error",
          recoverable: value.recoverable,
          message: value.message,
        };
      }
      break;
    case "done":
      return { id: value.id, type: "done" };
  }

  throw new Error("Live SSE payload is not a UiEvent");
}

function parseSseFrames(contents: string): UiEvent[] {
  return contents
    .replaceAll("\r\n", "\n")
    .split("\n\n")
    .filter((frame) => frame.trim().length > 0)
    .map((frame) =>
      frame
        .split("\n")
        .filter((line) => line.startsWith("data:"))
        .map((line) => line.slice("data:".length).trimStart())
        .join("\n"),
    )
    .filter((payload) => payload.length > 0)
    .map(parseUiEvent);
}

let dependencies: ReturnType<typeof buildLiveDependencies> | undefined;

function getLiveDependencies(): ReturnType<typeof buildLiveDependencies> {
  if (dependencies === undefined) {
    throw new Error("Live dependencies were not initialized");
  }
  return dependencies;
}

async function runLive(request: BffRequest, runId: string): Promise<UiEvent[]> {
  const context: BffRequestContext = {
    runId,
    reconnect: false,
    signal: new AbortController().signal,
  };
  const result = await handleBffRequest(
    request,
    context,
    getLiveDependencies(),
  );

  if (result.kind === "card") {
    return [{ id: `${runId}:card`, type: "card:ready", card: result.card }];
  }

  const reader = result.stream.getReader();
  const decoder = new TextDecoder();
  let contents = "";

  while (true) {
    const chunk = await reader.read();
    if (chunk.done) {
      contents += decoder.decode();
      break;
    }
    contents += decoder.decode(chunk.value, { stream: true });
  }

  return parseSseFrames(contents);
}

describe.skipIf(!process.env.RUN_LIVE_TESTS)("live generate-design", () => {
  beforeAll(() => {
    dependencies ??= buildLiveDependencies(process.env);
  });

  // This triggers exactly one real Apify crawl, one real MA session, and one real Seedream image.
  it("generates a design through the real live stack", async () => {
    const request = {
      kind: "generate-design",
      crawl: {
        source: "google_trends",
        market: "US",
        seed: "retro halloween cats",
        productType: "t-shirt",
        mode: "live",
      },
    } satisfies BffRequest;

    const events = await runLive(request, crypto.randomUUID());

    expect(
      events.some(
        (event) =>
          event.type === "scanning" || event.type === "synthesizing",
      ),
    ).toBe(true);
    expect(events.some((event) => event.type === "done")).toBe(true);
    expect(events.some((event) => event.type === "error")).toBe(false);

    const image = events.find((event) => event.type === "image:ready");
    expect(image).toBeDefined();
    expect(image?.url).toMatch(/^https:\/\/.+/);
  });
});

describe.skipIf(
  !(process.env.RUN_LIVE_TESTS && process.env.RUN_LIVE_DEEPDIVE),
)("live deep-dive", () => {
  beforeAll(() => {
    dependencies ??= buildLiveDependencies(process.env);
  });

  // This may trigger an additional real Apify crawl, hence the second RUN_LIVE_DEEPDIVE gate.
  it("answers a deep-dive question through the real live stack", async () => {
    const request = {
      kind: "deep-dive",
      crawl: {
        source: "google_trends",
        market: "US",
        seed: "retro halloween cats",
        productType: "t-shirt",
        mode: "live",
      },
      question: "Why is this opportunity rising and who should I target?",
    } satisfies BffRequest;

    const events = await runLive(request, crypto.randomUUID());

    expect(events.some((event) => event.type === "done")).toBe(true);
    expect(events.some((event) => event.type === "error")).toBe(false);

    const answer = events.find((event) => event.type === "answer");
    expect(answer).toBeDefined();
    expect(answer?.text.trim().length).toBeGreaterThan(0);
  });
});
