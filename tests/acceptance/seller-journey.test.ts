import { describe, expect, it } from "vitest";

import { CREDIT_COSTS } from "../../packages/config/credits.config";
import type {
  CreditLedgerEntry,
  CrawlRequest,
  PublishDesignRequest,
} from "../../packages/contracts";
import { GENERATE_DESIGN_IMAGE_TOOL } from "../../src/agent/__fixtures__/managed-agent-events";
import { rankOpportunities } from "../../src/integration/rank-opportunities";
import type { WarehouseBuildInput } from "../../src/warehouse/types";
import {
  collectUiEvents,
  createC4AcceptanceHarness,
  providerOutputs,
} from "./support/c4-acceptance-harness";

const BASE_INPUT = {
  market: "US",
  seed: "retro halloween cats",
  productType: "t-shirt",
  freshnessTier: "hot",
} satisfies WarehouseBuildInput;

function liveCrawl(seed: string): CrawlRequest {
  return {
    source: "google_trends",
    market: "US",
    seed,
    productType: "t-shirt",
    mode: "live",
  };
}

function debitEntries(entries: CreditLedgerEntry[]) {
  return entries.filter((entry) => entry.kind === "debit");
}

describe("C4 signal 1: seller journey", () => {
  it("presents assembled scored opportunities ranked descending", async () => {
    const harness = createC4AcceptanceHarness();
    const scenarios = [
      { seed: "low halloween opportunity", factor: 0.5 },
      { seed: "high halloween opportunity", factor: 1 },
      { seed: "mid halloween opportunity", factor: 0.75 },
    ];

    const builtCards = await Promise.all(
      scenarios.map(({ seed, factor }) =>
        harness.buildCard(
          { ...BASE_INPUT, seed },
          { outputs: providerOutputs(factor) },
        ),
      ),
    );
    const opportunities = rankOpportunities(
      builtCards.map(({ card }) => card),
    );
    const scores = opportunities.map((card) => card.opportunityScore);

    expect(scores.every((score) => score >= 0 && score <= 100)).toBe(true);
    expect(
      scores.every(
        (score, index) => index === 0 || scores[index - 1] > score,
      ),
    ).toBe(true);
  });

  it("generates one draft, debits generate_design exactly once, and publishes it", async () => {
    const harness = createC4AcceptanceHarness();
    const { card } = await harness.buildCard(BASE_INPUT);
    const crawl = liveCrawl(card.seed);

    harness.pushManagedEvents([
      {
        id: "journey-synthesizing",
        type: "agent.thinking",
        note: "Preparing the selected Halloween opportunity as a draft.",
      },
      {
        id: "journey-image",
        type: "user.custom_tool_result",
        custom_tool_use_id: "journey-seedream-call",
        name: GENERATE_DESIGN_IMAGE_TOOL.name,
        input: GENERATE_DESIGN_IMAGE_TOOL.input,
        result: GENERATE_DESIGN_IMAGE_TOOL.result,
      },
      {
        id: "journey-idle",
        type: "session.status_idle",
        stop_reason: { type: "end_turn" },
      },
    ]);
    const events = await collectUiEvents(
      harness.uiEventSource("run-c4-generate", {
        kind: "generate-design",
        crawl,
        idempotencyKey: "generate-c4-once",
      }),
    );

    expect(events.map((event) => event.type)).toEqual([
      "synthesizing",
      "image:ready",
      "done",
    ]);
    expect(harness.managedAgentSession.order.slice(0, 2)).toEqual([
      "open",
      "send",
    ]);
    expect(harness.managedAgentSession.sent).toEqual([
      expect.objectContaining({ kind: "generate-design", crawl }),
    ]);

    const image = events.find((event) => event.type === "image:ready");
    if (!image || image.type !== "image:ready") {
      throw new Error("Expected image:ready");
    }
    expect(image.url).toBe(GENERATE_DESIGN_IMAGE_TOOL.result.url);

    const ledgerBeforePublish = harness.creditRepository.ledgerEntries(
      harness.sellerId,
    );
    expect(debitEntries(ledgerBeforePublish)).toEqual([
      expect.objectContaining({
        action: "generate_design",
        credits: CREDIT_COSTS.generate_design,
        idempotencyKey: "generate-c4-once",
      }),
    ]);
    expect(harness.creditRepository.balance(harness.sellerId)).toMatchObject({
      availableCredits:
        20 - CREDIT_COSTS.generate_design,
      version: 2,
    });

    const publishRequest = {
      sellerId: harness.sellerId,
      projectId: "project-c4-journey",
      idempotencyKey: "publish-c4-once",
      design: {
        assetUrl: image.url,
        title: card.recommendation.action,
        description: card.recommendation.reasoning,
        tags: ["halloween", "retro-cat"],
        market: card.market,
        productType: card.productType ?? "t-shirt",
      },
    } satisfies PublishDesignRequest;
    const publication = await harness.publishing.publish(publishRequest);

    expect(publication).toEqual({
      ok: true,
      publication: expect.objectContaining({
        sellerId: harness.sellerId,
        projectId: "project-c4-journey",
        provider: "printerval",
        status: "published",
        providerPublicationId: "printerval-acceptance-1",
        publishedUrl: "https://printerval.example/designs/acceptance-1",
      }),
    });
    expect(harness.publisher.calls).toEqual([
      {
        projectId: publishRequest.projectId,
        idempotencyKey: publishRequest.idempotencyKey,
        design: publishRequest.design,
      },
    ]);
    expect(
      debitEntries(harness.creditRepository.ledgerEntries(harness.sellerId)),
    ).toHaveLength(1);

    expect(harness.metricSink.snapshot().counters).toEqual(
      expect.arrayContaining([
        {
          name: "ptv_live_request_total",
          labels: {
            requestKind: "generate_design",
            deliveryPath: "managed_agent",
            outcome: "success",
          },
          value: 1,
        },
        {
          name: "ptv_credits_debited_total",
          labels: { action: "generate_design" },
          value: CREDIT_COSTS.generate_design,
        },
        {
          name: "ptv_infra_operation_total",
          labels: {
            component: "printerval",
            operation: "publish",
            outcome: "success",
          },
          value: 1,
        },
      ]),
    );
  });
});
