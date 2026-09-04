import { describe, expect, it } from "vitest";

import type {
  Publication,
  PublishDesignRequest,
} from "../../../packages/contracts";
import { PostgresPublicationRepository } from "../postgres-publication-repository";
import type {
  QueryExecutor,
  QueryResult,
} from "../postgres-trend-card-repository";

const REQUEST: PublishDesignRequest = {
  sellerId: "seller-publication",
  projectId: "project-publication",
  idempotencyKey: "publish-publication",
  design: {
    assetUrl: "https://assets.example/design.png",
    title: "Retro Halloween Cat",
    description: "Seasonal cat artwork",
    tags: ["cat", "halloween"],
    market: "US",
    productType: "t-shirt",
  },
};

const PENDING_ROW = {
  id: "publication-1",
  seller_id: REQUEST.sellerId,
  project_id: REQUEST.projectId,
  provider: "printerval",
  idempotency_key: REQUEST.idempotencyKey,
  status: "pending",
  provider_publication_id: null,
  published_url: null,
  failure_code: null,
  failure_recoverable: null,
  failure_message: null,
  created_at: new Date("2026-09-04T01:00:00.000Z"),
  updated_at: new Date("2026-09-04T01:00:00.000Z"),
};

const PENDING_PUBLICATION: Publication = {
  id: "publication-1",
  sellerId: REQUEST.sellerId,
  projectId: REQUEST.projectId,
  provider: "printerval",
  idempotencyKey: REQUEST.idempotencyKey,
  status: "pending",
  createdAt: "2026-09-04T01:00:00.000Z",
  updatedAt: "2026-09-04T01:00:00.000Z",
};

interface QueryCall {
  sql: string;
  parameters: readonly unknown[];
}

class MockQueryExecutor implements QueryExecutor {
  readonly calls: QueryCall[] = [];

  constructor(private readonly rowBatches: unknown[][]) {}

  async query<Row>(
    sql: string,
    parameters: readonly unknown[],
  ): Promise<QueryResult<Row>> {
    this.calls.push({ sql, parameters });
    return { rows: (this.rowBatches.shift() ?? []) as Row[] };
  }
}

function expectValuesAreParameterized(
  calls: readonly QueryCall[],
  values: readonly string[],
): void {
  for (const call of calls) {
    for (const value of values) {
      expect(call.sql).not.toContain(value);
    }
  }
}

describe("PostgresPublicationRepository", () => {
  it("reserves a new pending publication with parameterized design data", async () => {
    const executor = new MockQueryExecutor([[], [PENDING_ROW]]);
    const repository = new PostgresPublicationRepository(executor);

    const result = await repository.reserve(REQUEST);

    expect(result).toEqual({ kind: "winner", publication: PENDING_PUBLICATION });
    expect(executor.calls).toHaveLength(2);
    expect(executor.calls[0].sql).toContain("FROM publications");
    expect(executor.calls[1].sql).toContain("INSERT INTO publications");
    expect(executor.calls[1].sql).toContain("ON CONFLICT (seller_id, idempotency_key) DO NOTHING");
    expect(executor.calls[1].sql).toContain("$10::jsonb");
    expect(executor.calls[1].parameters[0]).toEqual(expect.any(String));
    expect(executor.calls[1].parameters).toEqual([
      expect.any(String),
      REQUEST.sellerId,
      REQUEST.projectId,
      REQUEST.idempotencyKey,
      "printerval",
      "pending",
      REQUEST.design.assetUrl,
      REQUEST.design.title,
      REQUEST.design.description,
      JSON.stringify(REQUEST.design.tags),
      REQUEST.design.market,
      REQUEST.design.productType,
    ]);
    expectValuesAreParameterized(executor.calls, [
      REQUEST.sellerId,
      REQUEST.idempotencyKey,
      REQUEST.design.assetUrl,
      REQUEST.design.title,
    ]);
  });

  it("returns an existing pending result for the same project", async () => {
    const executor = new MockQueryExecutor([[PENDING_ROW]]);
    const repository = new PostgresPublicationRepository(executor);

    await expect(repository.reserve(REQUEST)).resolves.toEqual({
      kind: "existing",
      result: { ok: true, publication: PENDING_PUBLICATION },
    });
  });

  it("returns a conflict when the key belongs to a different project", async () => {
    const executor = new MockQueryExecutor([
      [{ ...PENDING_ROW, project_id: "existing-project" }],
    ]);
    const repository = new PostgresPublicationRepository(executor);

    await expect(repository.reserve(REQUEST)).resolves.toEqual({
      kind: "conflict",
      error: {
        ok: false,
        error: {
          code: "publication_idempotency_conflict",
          sellerId: REQUEST.sellerId,
          idempotencyKey: REQUEST.idempotencyKey,
          existingProjectId: "existing-project",
          requestedProjectId: REQUEST.projectId,
        },
      },
    });
  });

  it("reconstructs an existing published result", async () => {
    const publishedRow = {
      ...PENDING_ROW,
      status: "published",
      provider_publication_id: "provider-123",
      published_url: "https://printerval.example/stub/provider-123",
    };
    const executor = new MockQueryExecutor([[publishedRow]]);
    const repository = new PostgresPublicationRepository(executor);

    await expect(repository.reserve(REQUEST)).resolves.toEqual({
      kind: "existing",
      result: {
        ok: true,
        publication: {
          ...PENDING_PUBLICATION,
          status: "published",
          providerPublicationId: "provider-123",
          publishedUrl: "https://printerval.example/stub/provider-123",
        },
      },
    });
  });

  it("reconstructs an existing failed result and error", async () => {
    const failedRow = {
      ...PENDING_ROW,
      status: "failed",
      failure_code: "printerval_unavailable",
      failure_recoverable: true,
      failure_message: "Try again later",
    };
    const executor = new MockQueryExecutor([[failedRow]]);
    const repository = new PostgresPublicationRepository(executor);

    await expect(repository.reserve(REQUEST)).resolves.toEqual({
      kind: "existing",
      result: {
        ok: false,
        publication: { ...PENDING_PUBLICATION, status: "failed" },
        error: {
          code: "printerval_unavailable",
          recoverable: true,
          message: "Try again later",
        },
      },
    });
  });

  it("saves a successful provider response as published", async () => {
    const updatedAt = new Date("2026-09-04T02:00:00.000Z");
    const executor = new MockQueryExecutor([[{ updated_at: updatedAt }]]);
    const repository = new PostgresPublicationRepository(executor);

    const result = await repository.saveProviderResult(PENDING_PUBLICATION, {
      ok: true,
      publicationId: "provider-456",
      status: "published",
      publishedUrl: "https://printerval.example/stub/provider-456",
    });

    expect(executor.calls[0].sql).toContain("UPDATE publications");
    expect(executor.calls[0].sql).toContain("provider_publication_id");
    expect(executor.calls[0].sql).toContain("published_url");
    expect(executor.calls[0].parameters).toEqual([
      PENDING_PUBLICATION.id,
      "published",
      "provider-456",
      "https://printerval.example/stub/provider-456",
    ]);
    expectValuesAreParameterized(executor.calls, ["provider-456"]);
    expect(result).toEqual({
      ok: true,
      publication: {
        ...PENDING_PUBLICATION,
        status: "published",
        providerPublicationId: "provider-456",
        publishedUrl: "https://printerval.example/stub/provider-456",
        updatedAt: updatedAt.toISOString(),
      },
    });
  });

  it("saves a provider error and its failure fields", async () => {
    const updatedAt = "2026-09-04T03:00:00.000Z";
    const executor = new MockQueryExecutor([[{ updated_at: updatedAt }]]);
    const repository = new PostgresPublicationRepository(executor);
    const error = {
      code: "printerval_rejected" as const,
      recoverable: false,
      message: "Design rejected",
    };

    const result = await repository.saveProviderResult(
      PENDING_PUBLICATION,
      { ok: false, error },
    );

    expect(executor.calls[0].sql).toContain("UPDATE publications");
    expect(executor.calls[0].sql).toContain("failure_code");
    expect(executor.calls[0].sql).toContain("failure_recoverable");
    expect(executor.calls[0].sql).toContain("failure_message");
    expect(executor.calls[0].parameters).toEqual([
      PENDING_PUBLICATION.id,
      "failed",
      error.code,
      error.recoverable,
      error.message,
    ]);
    expectValuesAreParameterized(executor.calls, [error.message]);
    expect(result).toEqual({
      ok: false,
      publication: {
        ...PENDING_PUBLICATION,
        status: "failed",
        updatedAt,
      },
      error,
    });
  });
});
