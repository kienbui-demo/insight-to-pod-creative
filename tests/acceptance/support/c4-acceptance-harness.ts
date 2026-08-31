import { CACHE_SIM_THRESHOLD } from "../../../packages/config/cache.config";
import {
  CREDIT_COSTS,
  DEFAULT_SEED_CREDIT_GRANT,
} from "../../../packages/config/credits.config";
import type {
  CreditBalance,
  CreditDebitRequest,
  CreditDebitResult,
  CreditLedgerEntry,
  CrawlRequest,
  CrawlSource,
  ProvisionalPrintervalPublishRequest,
  ProvisionalPrintervalPublishResponse,
  Publication,
  PublishDesignRequest,
  PublishDesignResult,
  TrendCard,
  UiEvent,
} from "../../../packages/contracts";
import amazonFixture from "../../../src/adapters/commerce/__fixtures__/amazon-response.provisional.json";
import etsyFixture from "../../../src/adapters/commerce/__fixtures__/etsy-response.provisional.json";
import metaAdsFixture from "../../../src/adapters/commerce/__fixtures__/meta-ads-response.provisional.json";
import { amazonAdapter } from "../../../src/adapters/commerce/amazon-adapter";
import { etsyAdapter } from "../../../src/adapters/commerce/etsy-adapter";
import { metaAdsAdapter } from "../../../src/adapters/commerce/meta-ads-adapter";
import googleTrendsFixture from "../../../src/adapters/culture/__fixtures__/google-trends-response.provisional.json";
import pinterestFixture from "../../../src/adapters/culture/__fixtures__/pinterest-response.provisional.json";
import redditFixture from "../../../src/adapters/culture/__fixtures__/reddit-response.provisional.json";
import tiktokFixture from "../../../src/adapters/culture/__fixtures__/tiktok-response.provisional.json";
import { googleTrendsAdapter } from "../../../src/adapters/culture/google-trends-adapter";
import { pinterestAdapter } from "../../../src/adapters/culture/pinterest-adapter";
import { redditAdapter } from "../../../src/adapters/culture/reddit-adapter";
import { tiktokAdapter } from "../../../src/adapters/culture/tiktok-adapter";
import { createModelArkLiveSessionPort } from "../../../src/agent/modelark-live-session";
import type { ManagedAgentEvent } from "../../../src/agent/ports";
import {
  FakeManagedAgentClient,
  FakeManagedAgentSession,
} from "../../../src/agent/__tests__/support/fake-managed-agent-client";
import { FakeSeedreamImagePort } from "../../../src/agent/__tests__/support/fake-seedream-image-port";
import type {
  BffRequest,
  TrendCardLookupPort,
} from "../../../src/bff/types";
import { createLivePostHandler } from "../../../src/integration/live-route";
import { RouteDispatchFetch } from "../../../src/integration/__tests__/support/route-dispatch-fetch";
import {
  createCreditService,
  type CreditRepository,
} from "../../../src/monetization/credit-service";
import {
  createPublishService,
  type PrintervalPublisher,
  type PublicationRepository,
  type PublicationReservation,
} from "../../../src/monetization/publish-service";
import { InMemoryMetricSink } from "../../../src/monitoring/in-memory-metric-sink";
import { FakeTrendCardRepository } from "../../../src/storage/__tests__/support/fake-trend-card-repository";
import { createSseUiEventSource } from "../../../src/ui/live-theater/sse-ui-event-source";
import type { UiEventSource } from "../../../src/ui/live-theater/event-source";
import { reduceOpportunityComponents } from "../../../src/warehouse/component-reducer";
import { buildTrendCard } from "../../../src/warehouse/trend-card-builder";
import type { WarehouseBuildInput } from "../../../src/warehouse/types";
import { FakeCrawlTransport } from "../../../src/warehouse/__tests__/support/fake-crawl-transport";
import { FixedClock } from "../../../src/warehouse/__tests__/support/fixed-clock";
import { MockMaRecommendation } from "../../../src/warehouse/__tests__/support/mock-ma-recommendation";

const NOW = "2026-08-31T09:00:00.000Z";

const ADAPTERS = {
  google_trends: googleTrendsAdapter,
  reddit: redditAdapter,
  pinterest: pinterestAdapter,
  tiktok: tiktokAdapter,
  amazon: amazonAdapter,
  etsy: etsyAdapter,
  meta_ads: metaAdsAdapter,
} as const;

const PROVIDER_FIXTURES = {
  google_trends: googleTrendsFixture,
  reddit: redditFixture,
  pinterest: pinterestFixture,
  tiktok: tiktokFixture,
  amazon: amazonFixture,
  etsy: etsyFixture,
  meta_ads: metaAdsFixture,
} as const;

type OperationStatus = "not_started" | "started" | "succeeded" | "refunded";

interface StoredCreditDecision {
  result: Extract<CreditDebitResult, { decision: unknown }>;
  operationStatus: OperationStatus;
}

class AcceptanceCreditRepository implements CreditRepository {
  private readonly accounts = new Map<
    string,
    { balance: number; version: number }
  >();
  private readonly decisions = new Map<string, StoredCreditDecision>();
  private readonly ledger: CreditLedgerEntry[] = [];
  private sequence = 0;

  async ensureAccount(
    sellerId: string,
    seedCredits: number,
  ): Promise<CreditBalance> {
    if (!this.accounts.has(sellerId)) {
      this.accounts.set(sellerId, { balance: seedCredits, version: 1 });
      this.ledger.push({
        id: this.nextId("ledger"),
        sellerId,
        kind: "grant",
        grantReason: "seed",
        credits: seedCredits,
        idempotencyKey: "seed-grant:v1",
        balanceAfter: seedCredits,
        createdAt: NOW,
      });
    }
    return this.balance(sellerId);
  }

  async debit(
    request: CreditDebitRequest,
    cost: number,
  ): Promise<CreditDebitResult> {
    const key = `${request.sellerId}:${request.idempotencyKey}`;
    const existing = this.decisions.get(key);
    if (existing) {
      const decision = existing.result.decision;
      if (decision.runId !== request.runId || decision.action !== request.action) {
        return {
          ok: false,
          error: {
            code: "idempotency_conflict",
            sellerId: request.sellerId,
            idempotencyKey: request.idempotencyKey,
            existingRunId: decision.runId,
            requestedRunId: request.runId,
            existingAction: decision.action,
            requestedAction: request.action,
          },
        };
      }
      return existing.result;
    }

    const account = this.requiredAccount(request.sellerId);
    const base = {
      id: this.nextId("decision"),
      ...request,
      cost,
      balanceBefore: account.balance,
      decidedAt: NOW,
    };
    if (account.balance < cost) {
      const result = {
        ok: false,
        decision: {
          ...base,
          status: "rejected",
          balanceAfter: account.balance,
        },
        error: {
          code: "insufficient_credit",
          ...request,
          requiredCredits: cost,
          availableCredits: account.balance,
        },
      } satisfies CreditDebitResult;
      this.decisions.set(key, { result, operationStatus: "not_started" });
      return result;
    }

    account.balance -= cost;
    account.version += 1;
    const result = {
      ok: true,
      decision: {
        ...base,
        status: "applied",
        balanceAfter: account.balance,
      },
    } satisfies CreditDebitResult;
    this.decisions.set(key, { result, operationStatus: "not_started" });
    this.ledger.push({
      id: this.nextId("ledger"),
      sellerId: request.sellerId,
      kind: "debit",
      action: request.action,
      credits: cost,
      idempotencyKey: request.idempotencyKey,
      debitDecisionId: result.decision.id,
      balanceAfter: account.balance,
      createdAt: NOW,
    });
    return result;
  }

  async claimOperation(decisionId: string): Promise<boolean> {
    const stored = this.findDecision(decisionId);
    if (!stored || stored.operationStatus !== "not_started") return false;
    stored.operationStatus = "started";
    return true;
  }

  async markOperationSucceeded(decisionId: string): Promise<void> {
    const stored = this.findDecision(decisionId);
    if (stored?.operationStatus === "started") {
      stored.operationStatus = "succeeded";
    }
  }

  async refundFailedOperation(decisionId: string): Promise<void> {
    const stored = this.findDecision(decisionId);
    if (!stored || !stored.result.ok || stored.operationStatus === "refunded") {
      return;
    }
    const decision = stored.result.decision;
    const account = this.requiredAccount(decision.sellerId);
    account.balance += decision.cost;
    account.version += 1;
    stored.operationStatus = "refunded";
    this.ledger.push({
      id: this.nextId("ledger"),
      sellerId: decision.sellerId,
      kind: "grant",
      grantReason: "refund",
      credits: decision.cost,
      idempotencyKey: `refund:${decision.id}`,
      originalDebitDecisionId: decision.id,
      balanceAfter: account.balance,
      createdAt: NOW,
    });
  }

  balance(sellerId: string): CreditBalance {
    const account = this.requiredAccount(sellerId);
    return {
      sellerId,
      availableCredits: account.balance,
      version: account.version,
      updatedAt: NOW,
    };
  }

  ledgerEntries(sellerId: string): CreditLedgerEntry[] {
    return this.ledger.filter((entry) => entry.sellerId === sellerId);
  }

  private requiredAccount(sellerId: string) {
    const account = this.accounts.get(sellerId);
    if (!account) throw new Error(`Missing credit account for ${sellerId}`);
    return account;
  }

  private findDecision(decisionId: string): StoredCreditDecision | undefined {
    return [...this.decisions.values()].find(
      ({ result }) => result.decision.id === decisionId,
    );
  }

  private nextId(prefix: string): string {
    this.sequence += 1;
    return `${prefix}-${this.sequence}`;
  }
}

class AcceptancePublicationRepository implements PublicationRepository {
  private readonly publications = new Map<
    string,
    { publication: Publication; result?: PublishDesignResult }
  >();
  private sequence = 0;

  async reserve(request: PublishDesignRequest): Promise<PublicationReservation> {
    const key = `${request.sellerId}:${request.idempotencyKey}`;
    const existing = this.publications.get(key);
    if (existing) {
      if (existing.publication.projectId !== request.projectId) {
        return {
          kind: "conflict",
          error: {
            ok: false,
            error: {
              code: "publication_idempotency_conflict",
              sellerId: request.sellerId,
              idempotencyKey: request.idempotencyKey,
              existingProjectId: existing.publication.projectId,
              requestedProjectId: request.projectId,
            },
          },
        };
      }
      return {
        kind: "existing",
        result:
          existing.result ?? {
            ok: true,
            publication: { ...existing.publication, status: "pending" },
          },
      };
    }

    this.sequence += 1;
    const publication: Publication = {
      id: `publication-${this.sequence}`,
      sellerId: request.sellerId,
      projectId: request.projectId,
      provider: "printerval",
      idempotencyKey: request.idempotencyKey,
      status: "pending",
      createdAt: NOW,
      updatedAt: NOW,
    };
    this.publications.set(key, { publication });
    return { kind: "winner", publication };
  }

  async saveProviderResult(
    publication: Publication,
    response: ProvisionalPrintervalPublishResponse,
  ): Promise<PublishDesignResult> {
    const result: PublishDesignResult = response.ok
      ? {
          ok: true,
          publication: {
            ...publication,
            status: "published",
            providerPublicationId: response.publicationId,
            publishedUrl: response.publishedUrl,
            updatedAt: NOW,
          },
        }
      : {
          ok: false,
          publication: { ...publication, status: "failed", updatedAt: NOW },
          error: response.error,
        };
    this.publications.set(
      `${publication.sellerId}:${publication.idempotencyKey}`,
      { publication: result.publication, result },
    );
    return result;
  }
}

class AcceptancePrintervalPublisher implements PrintervalPublisher {
  readonly calls: ProvisionalPrintervalPublishRequest[] = [];

  constructor(
    private readonly response: ProvisionalPrintervalPublishResponse = {
      ok: true,
      publicationId: "printerval-acceptance-1",
      status: "published",
      publishedUrl: "https://printerval.example/designs/acceptance-1",
    },
  ) {}

  async publish(
    request: ProvisionalPrintervalPublishRequest,
  ): Promise<ProvisionalPrintervalPublishResponse> {
    this.calls.push(structuredClone(request));
    return this.response;
  }
}

class RepositoryBackedLookup implements TrendCardLookupPort {
  constructor(readonly repository: FakeTrendCardRepository) {}

  async lookup(request: CrawlRequest) {
    const key = {
      market: request.market,
      seed: request.seed.trim().toLowerCase(),
      productType: request.productType,
    };
    const exact = await this.repository.findExact(key);
    if (exact) return { kind: "hit" as const, card: exact };
    const similar = await this.repository.findSimilar(key);
    return similar && similar.similarity >= CACHE_SIM_THRESHOLD
      ? { kind: "hit" as const, card: similar.card }
      : { kind: "miss" as const };
  }
}

export type MeteredBffRequest = BffRequest & { idempotencyKey: string };

export interface WarehouseBuildOptions {
  outputs?: Partial<Record<CrawlSource, unknown>>;
  errors?: Partial<Record<CrawlSource, Error>>;
}

export interface AcceptanceHarnessOptions {
  cache?: {
    exact?: TrendCard | null;
    similar?: { card: TrendCard; similarity: number } | null;
  };
  history?: readonly ManagedAgentEvent[];
  sellerId?: string;
}

function scaleFixture(value: unknown, factor: number): unknown {
  if (Array.isArray(value)) {
    return value.map((entry) => scaleFixture(entry, factor));
  }
  if (typeof value !== "object" || value === null) return value;

  return Object.fromEntries(
    Object.entries(value).map(([key, entry]) => [
      key,
      key === "normalizedValue" && typeof entry === "number"
        ? Math.max(0, Math.min(1, entry * factor))
        : scaleFixture(entry, factor),
    ]),
  );
}

export function providerOutputs(
  normalizedValueFactor = 1,
): Partial<Record<CrawlSource, unknown>> {
  return Object.fromEntries(
    Object.entries(PROVIDER_FIXTURES).map(([source, fixture]) => [
      source,
      scaleFixture(structuredClone(fixture), normalizedValueFactor),
    ]),
  ) as Partial<Record<CrawlSource, unknown>>;
}

export async function collectUiEvents(
  source: UiEventSource,
): Promise<UiEvent[]> {
  const events: UiEvent[] = [];
  for await (const event of source.events()) events.push(event);
  return events;
}

export async function responseUiEvents(response: Response): Promise<UiEvent[]> {
  const text = await response.text();
  return text
    .split("\n\n")
    .filter(Boolean)
    .map((frame) => {
      const data = frame
        .split("\n")
        .find((line) => line.startsWith("data: "));
      if (!data) throw new Error(`Missing SSE data line in ${frame}`);
      return JSON.parse(data.slice("data: ".length)) as UiEvent;
    });
}

export function createC4AcceptanceHarness(
  options: AcceptanceHarnessOptions = {},
) {
  const sellerId = options.sellerId ?? "seller-c4";
  const metricSink = new InMemoryMetricSink();
  const cacheRepository = new FakeTrendCardRepository(options.cache);
  const lookup = new RepositoryBackedLookup(cacheRepository);
  const managedAgentSession = new FakeManagedAgentSession(options.history);
  const managedAgentClient = new FakeManagedAgentClient(managedAgentSession);
  const seedream = new FakeSeedreamImagePort();
  const liveSessions = createModelArkLiveSessionPort({
    client: managedAgentClient,
    seedream,
    maxImagesPerAction: 1,
    metricSink,
  });
  const creditRepository = new AcceptanceCreditRepository();
  const credits = createCreditService({
    repository: creditRepository,
    costs: CREDIT_COSTS,
    seedCredits: DEFAULT_SEED_CREDIT_GRANT,
    metricSink,
  });
  const post = createLivePostHandler({
    lookup,
    liveSessions,
    credits,
    authenticateSeller: async () => ({ sellerId }),
    metricSink,
  });
  const routeFetch = new RouteDispatchFetch(post);
  const publicationRepository = new AcceptancePublicationRepository();
  const publisher = new AcceptancePrintervalPublisher();
  const publishing = createPublishService({
    repository: publicationRepository,
    publisher,
    credits: {
      async debit() {
        throw new Error("Publishing must not debit credits");
      },
    },
    managedAgent: {
      async open() {
        throw new Error("Publishing must not open MA");
      },
    },
    metricSink,
  });

  async function buildCard(
    input: WarehouseBuildInput,
    buildOptions: WarehouseBuildOptions = {},
  ) {
    const transport = new FakeCrawlTransport({
      outputs: buildOptions.outputs ?? providerOutputs(),
      errors: buildOptions.errors,
    });
    const recommendation = new MockMaRecommendation();
    const failures: Array<{ source: CrawlSource; error: unknown }> = [];
    const card = await buildTrendCard(input, {
      adapters: ADAPTERS,
      transport,
      reducer: { reduce: reduceOpportunityComponents },
      recommendation,
      clock: new FixedClock(),
      logger: {
        sourceFailure(source, error) {
          failures.push({ source, error });
        },
      },
      metricSink,
    });
    return { card, failures, recommendation, transport };
  }

  function pushManagedEvents(events: readonly ManagedAgentEvent[]): void {
    for (const event of events) managedAgentSession.events.push(event);
  }

  function uiEventSource(
    runId: string,
    request: MeteredBffRequest,
    maxReconnects = 0,
  ): UiEventSource {
    return createSseUiEventSource({
      url: "http://in-memory.test/api/live",
      runId,
      request,
      fetch: routeFetch.fetch,
      maxReconnects,
    });
  }

  function liveRequest(
    runId: string,
    request: MeteredBffRequest,
    reconnect = false,
  ): Request {
    return new Request("http://in-memory.test/api/live", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        runId,
        reconnect,
        sellerId: "client-supplied-must-be-ignored",
        request,
      }),
    });
  }

  return {
    buildCard,
    cacheRepository,
    creditRepository,
    credits,
    liveRequest,
    managedAgentClient,
    managedAgentSession,
    metricSink,
    post,
    publisher,
    publishing,
    pushManagedEvents,
    routeFetch,
    seedream,
    sellerId,
    uiEventSource,
  };
}
