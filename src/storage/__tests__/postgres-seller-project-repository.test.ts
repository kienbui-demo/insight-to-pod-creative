import { describe, expect, it } from "vitest";

import type { SellerProject } from "../../../packages/contracts";
import { PostgresSellerProjectRepository } from "../postgres-seller-project-repository";
import type {
  QueryExecutor,
  QueryResult,
} from "../postgres-trend-card-repository";

const PROJECT_WITH_DESIGN: SellerProject = {
  id: "project-postgres",
  sellerId: "seller-123",
  market: "US",
  seed: "retro halloween cat",
  productType: "t-shirt",
  designAssetUrl: "https://assets.example/design.png",
  designTitle: "Retro Halloween Cat",
  designDescription: "A playful seasonal cat design.",
  designTags: ["halloween", "cat", "retro"],
  createdAt: "2026-09-04T01:00:00.000Z",
  updatedAt: "2026-09-04T02:00:00.000Z",
};

const DATABASE_ROW = {
  id: "project-postgres",
  seller_id: "seller-123",
  market: "US",
  seed: "retro halloween cat",
  product_type: "t-shirt",
  design_asset_url: "https://assets.example/design.png",
  design_title: "Retro Halloween Cat",
  design_description: "A playful seasonal cat design.",
  design_tags: ["halloween", "cat", "retro"],
  created_at: new Date("2026-09-04T01:00:00.000Z"),
  updated_at: new Date("2026-09-04T02:00:00.000Z"),
};

interface QueryCall {
  sql: string;
  parameters: readonly unknown[];
}

class MockQueryExecutor implements QueryExecutor {
  readonly calls: QueryCall[] = [];

  constructor(private readonly rows: unknown[]) {}

  async query<Row>(
    sql: string,
    parameters: readonly unknown[],
  ): Promise<QueryResult<Row>> {
    this.calls.push({ sql, parameters });
    return { rows: this.rows as Row[] };
  }
}

describe("PostgresSellerProjectRepository", () => {
  it("save upserts a project with its design fields", async () => {
    const executor = new MockQueryExecutor([]);
    const repository = new PostgresSellerProjectRepository(executor);

    await repository.save(PROJECT_WITH_DESIGN);

    expect(executor.calls).toHaveLength(1);
    expect(executor.calls[0].sql).toContain("INSERT INTO seller_projects");
    expect(executor.calls[0].sql).toContain(
      "ON CONFLICT (id) DO UPDATE",
    );
    expect(executor.calls[0].sql).toContain("$9::jsonb");
    expect(executor.calls[0].parameters[8]).toBe(
      JSON.stringify(PROJECT_WITH_DESIGN.designTags),
    );
    expect(executor.calls[0].parameters[0]).toBe(PROJECT_WITH_DESIGN.id);
  });

  it("save passes null for missing optional fields", async () => {
    const executor = new MockQueryExecutor([]);
    const repository = new PostgresSellerProjectRepository(executor);
    const project: SellerProject = {
      id: "project-without-design",
      sellerId: "seller-456",
      market: "DE",
      seed: "bauhaus winter",
      createdAt: "2026-09-04T03:00:00.000Z",
      updatedAt: "2026-09-04T03:00:00.000Z",
    };

    await repository.save(project);

    expect(executor.calls).toHaveLength(1);
    expect(executor.calls[0].parameters[4]).toBeNull();
    expect(executor.calls[0].parameters[5]).toBeNull();
    expect(executor.calls[0].parameters[6]).toBeNull();
    expect(executor.calls[0].parameters[7]).toBeNull();
    expect(executor.calls[0].parameters[8]).toBeNull();
  });

  it("findById maps a row to a SellerProject", async () => {
    const executor = new MockQueryExecutor([DATABASE_ROW]);
    const repository = new PostgresSellerProjectRepository(executor);

    const result = await repository.findById("project-postgres");

    expect(result).toEqual(PROJECT_WITH_DESIGN);
    expect(executor.calls).toHaveLength(1);
    expect(executor.calls[0].sql).toContain("WHERE id = $1");
    expect(executor.calls[0].parameters).toEqual(["project-postgres"]);
    expect(executor.calls[0].sql).not.toContain("project-postgres");
  });

  it("findById returns null when no row", async () => {
    const executor = new MockQueryExecutor([]);
    const repository = new PostgresSellerProjectRepository(executor);

    await expect(repository.findById("missing-project")).resolves.toBeNull();
  });

  it("findById coalesces SQL NULL design fields to undefined", async () => {
    const executor = new MockQueryExecutor([
      {
        ...DATABASE_ROW,
        product_type: null,
        design_asset_url: null,
        design_title: null,
        design_description: null,
        design_tags: null,
      },
    ]);
    const repository = new PostgresSellerProjectRepository(executor);

    const result = await repository.findById("project-postgres");

    expect(result?.productType).toBeUndefined();
    expect(result?.designAssetUrl).toBeUndefined();
    expect(result?.designTitle).toBeUndefined();
    expect(result?.designDescription).toBeUndefined();
    expect(result?.designTags).toBeUndefined();
  });
});
