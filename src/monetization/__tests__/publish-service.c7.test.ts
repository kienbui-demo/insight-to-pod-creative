import { describe, expect, it, vi } from "vitest";

import type {
  ProvisionalPrintervalPublishingFixture,
  ProvisionalPrintervalPublishRequest,
  ProvisionalPrintervalPublishResponse,
  Publication,
  PublicationError,
  PublishDesignPayload,
  PublishDesignRequest,
  PublishDesignResult,
} from "../../../packages/contracts";
import { createPublishService } from "../publish-service";

const NOW = "2026-08-28T09:15:00.000Z";

const DESIGN = {
  assetUrl: "https://seedream.example/provisional-design.png",
  title: "Retro Halloween Cat",
  description: "A provisional POD design fixture.",
  tags: ["halloween", "retro-cat"],
  market: "US",
  productType: "t-shirt",
} satisfies PublishDesignPayload;

const SUCCESS_FIXTURE = {
  fixtureStatus: "provisional",
  request: {
    projectId: "project-c7",
    idempotencyKey: "publish-c7",
    design: DESIGN,
  },
  response: {
    ok: true,
    publicationId: "printerval-provisional-123",
    status: "published",
    publishedUrl: "https://printerval.example/designs/provisional-123",
  },
} satisfies ProvisionalPrintervalPublishingFixture;

function failedFixture(error: PublicationError): ProvisionalPrintervalPublishingFixture {
  return {
    fixtureStatus: "provisional",
    request: SUCCESS_FIXTURE.request,
    response: { ok: false, error },
  };
}

interface StoredPublication {
  publication: Publication;
  result?: PublishDesignResult;
}

type Reservation =
  | { kind: "winner"; publication: Publication }
  | { kind: "existing"; result: PublishDesignResult }
  | {
      kind: "conflict";
      error: Extract<PublishDesignResult, { error: { code: "publication_idempotency_conflict" } }>;
    };

class InMemoryPublicationRepository {
  private readonly records = new Map<string, StoredPublication>();
  private sequence = 0;

  async reserve(request: PublishDesignRequest): Promise<Reservation> {
    const key = `${request.sellerId}:${request.idempotencyKey}`;
    const existing = this.records.get(key);
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
    this.records.set(key, { publication });
    return { kind: "winner", publication };
  }

  async saveProviderResult(
    publication: Publication,
    response: ProvisionalPrintervalPublishResponse,
  ): Promise<PublishDesignResult> {
    const key = `${publication.sellerId}:${publication.idempotencyKey}`;
    const stored = this.records.get(key);
    if (!stored) throw new Error("Publication was not reserved");

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
          publication: {
            ...publication,
            status: "failed",
            updatedAt: NOW,
          },
          error: response.error,
        };
    stored.publication = "publication" in result ? result.publication : publication;
    stored.result = result;
    return result;
  }
}

class FakeProvisionalPrintervalPublisher {
  readonly calls: ProvisionalPrintervalPublishRequest[] = [];

  constructor(readonly fixture: ProvisionalPrintervalPublishingFixture) {}

  async publish(
    request: ProvisionalPrintervalPublishRequest,
  ): Promise<ProvisionalPrintervalPublishResponse> {
    this.calls.push(request);
    return this.fixture.response;
  }
}

function request(
  overrides: Partial<PublishDesignRequest> = {},
): PublishDesignRequest {
  return {
    sellerId: "seller-c7",
    projectId: "project-c7",
    idempotencyKey: "publish-c7",
    design: { ...DESIGN, tags: [...DESIGN.tags] },
    ...overrides,
  };
}

function setup(fixture: ProvisionalPrintervalPublishingFixture = SUCCESS_FIXTURE) {
  const repository = new InMemoryPublicationRepository();
  const publisher = new FakeProvisionalPrintervalPublisher(fixture);
  const debitCredits = vi.fn(async () => {
    throw new Error("Publishing must not debit credits");
  });
  const openManagedAgent = vi.fn(async () => {
    throw new Error("Publishing must not open MA");
  });
  const dependencies = {
    repository,
    publisher,
    credits: { debit: debitCredits },
    managedAgent: { open: openManagedAgent },
  };
  const service = createPublishService(dependencies);
  return {
    debitCredits,
    openManagedAgent,
    publisher,
    repository,
    service,
  };
}

describe("C7 publish service", () => {
  it("publishes through the provisional Printerval fixture without credit or MA dependencies", async () => {
    const { debitCredits, openManagedAgent, publisher, service } = setup();

    const result = await service.publish(request());

    expect(SUCCESS_FIXTURE.fixtureStatus).toBe("provisional");
    expect(result).toEqual({
      ok: true,
      publication: {
        id: "publication-1",
        sellerId: "seller-c7",
        projectId: "project-c7",
        provider: "printerval",
        idempotencyKey: "publish-c7",
        status: "published",
        providerPublicationId: "printerval-provisional-123",
        publishedUrl: "https://printerval.example/designs/provisional-123",
        createdAt: NOW,
        updatedAt: NOW,
      },
    });
    expect(publisher.calls).toEqual([SUCCESS_FIXTURE.request]);
    expect(publisher.calls[0]).not.toHaveProperty("sellerId");
    expect(debitCredits).not.toHaveBeenCalled();
    expect(openManagedAgent).not.toHaveBeenCalled();
  });

  it.each([
    {
      code: "printerval_rejected" as const,
      recoverable: false,
      message: "Design rejected by provisional provider fixture",
    },
    {
      code: "printerval_unavailable" as const,
      recoverable: true,
      message: "Provisional provider unavailable",
    },
  ])("persists a failed $code result and honors recoverable=$recoverable", async (error) => {
    const fixture = failedFixture(error);
    const { publisher, service } = setup(fixture);

    const result = await service.publish(request());

    expect(fixture.fixtureStatus).toBe("provisional");
    expect(result).toEqual({
      ok: false,
      publication: expect.objectContaining({
        status: "failed",
        provider: "printerval",
      }),
      error,
    });
    expect(publisher.calls).toHaveLength(1);
  });

  it("returns the same persisted failed result for the same key and requires a new key to retry", async () => {
    const fixture = failedFixture({
      code: "printerval_unavailable",
      recoverable: true,
      message: "Retry later with a new key",
    });
    const { publisher, service } = setup(fixture);

    const first = await service.publish(request());
    const replay = await service.publish(request());

    expect(replay).toEqual(first);
    expect(replay).not.toHaveProperty("replayed");
    expect(publisher.calls).toHaveLength(1);

    await service.publish(request({ idempotencyKey: "publish-c7-retry" }));
    expect(publisher.calls).toHaveLength(2);
  });

  it("returns a publication conflict for the same key with another project", async () => {
    const { publisher, service } = setup();
    await service.publish(request());

    const result = await service.publish(
      request({ projectId: "project-different" }),
    );

    expect(result).toEqual({
      ok: false,
      error: {
        code: "publication_idempotency_conflict",
        sellerId: "seller-c7",
        idempotencyKey: "publish-c7",
        existingProjectId: "project-c7",
        requestedProjectId: "project-different",
      },
    });
    expect(publisher.calls).toHaveLength(1);
  });
});
