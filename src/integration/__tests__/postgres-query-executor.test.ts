import { describe, expect, it, vi } from "vitest";

import { createPostgresQueryExecutor } from "../postgres-query-executor";

type PoolQuery = (
  sql: string,
  parameters: readonly unknown[],
) => Promise<{ rows: unknown[] }>;

describe("createPostgresQueryExecutor", () => {
  it("delegates to the supplied pool and returns its rows", async () => {
    const poolResult = { rows: [{ id: "card-1" }] };
    const query = vi.fn<PoolQuery>().mockResolvedValue(poolResult);
    const executor = createPostgresQueryExecutor({ query });

    await expect(
      executor.query<{ id: string }>("SELECT id FROM trend_cards", []),
    ).resolves.toEqual(poolResult);
    expect(query).toHaveBeenCalledOnce();
  });

  it("passes SQL and parameters through unchanged", async () => {
    const query = vi.fn<PoolQuery>().mockResolvedValue({ rows: [] });
    const executor = createPostgresQueryExecutor({ query });
    const sql = "SELECT * FROM trend_cards WHERE market = $1 AND seed = $2";
    const parameters: readonly unknown[] = ["US", "retro halloween cats"];

    await executor.query(sql, parameters);

    expect(query.mock.calls[0]?.[0]).toBe(sql);
    expect(query.mock.calls[0]?.[1]).toBe(parameters);
  });
});
