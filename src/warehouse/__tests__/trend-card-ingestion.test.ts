import { beforeEach, describe, expect, it, vi } from "vitest";

import type { TrendCard } from "../../../packages/contracts";
import type { EmbeddingProvider } from "../../storage/postgres-trend-card-repository";
import type { TrendCardRepository } from "../../storage/trend-card-repository";
import { ingestTrendCard } from "../trend-card-ingestion";
import { buildTrendCard } from "../trend-card-builder";
import type {
  WarehouseBuildInput,
  WarehouseBuilderDependencies,
} from "../types";

vi.mock("../trend-card-builder", () => ({
  buildTrendCard: vi.fn(),
}));

const CARD: TrendCard = {
  id: "card-ingestion",
  market: "US",
  seed: "  Retro Halloween Cats  ",
  productType: "t-shirt",
  opportunityScore: 82,
  confidence: 0.91,
  availableSources: ["google_trends", "reddit", "amazon"],
  missingSources: ["pinterest", "tiktok", "etsy", "meta_ads"],
  trendSeries: [{ t: "2026-08-25", v: 72 }],
  referenceImages: ["tos://trend-cards/retro-halloween-cats.png"],
  competitors: [{ title: "Retro Cat Shirt", price: 24.99, adActive: true }],
  recommendation: {
    action: "Test a small seasonal collection",
    reasoning: "Demand is accelerating before the seasonal peak.",
  },
  freshnessTier: "hot",
  updatedAt: "2026-08-26T00:00:00.000Z",
};

const INPUT: WarehouseBuildInput = {
  market: "US",
  seed: "retro cats",
  productType: "t-shirt",
  freshnessTier: "hot",
};

class FakeEmbeddingProvider implements EmbeddingProvider {
  readonly seeds: string[] = [];

  constructor(
    private readonly vector: readonly number[] = [0.1, 0.2, 0.3],
    private readonly failure?: Error,
  ) {}

  async embed(seed: string): Promise<readonly number[]> {
    this.seeds.push(seed);
    if (this.failure) {
      throw this.failure;
    }
    return this.vector;
  }
}

interface SaveCall {
  card: TrendCard;
  embedding: readonly number[] | undefined;
}

class FakeRepository implements Pick<TrendCardRepository, "save"> {
  readonly calls: SaveCall[] = [];

  constructor(private readonly failure?: Error) {}

  async save(
    card: TrendCard,
    embedding?: readonly number[],
  ): Promise<void> {
    this.calls.push({ card, embedding });
    if (this.failure) {
      throw this.failure;
    }
  }
}

const warehouse = {} as WarehouseBuilderDependencies;
const buildTrendCardMock = vi.mocked(buildTrendCard);

describe("ingestTrendCard", () => {
  beforeEach(() => {
    buildTrendCardMock.mockReset();
    buildTrendCardMock.mockResolvedValue(CARD);
  });

  it("builds the card then persists it with its embedding", async () => {
    const embeddings = new FakeEmbeddingProvider();
    const repository = new FakeRepository();

    const result = await ingestTrendCard(INPUT, {
      warehouse,
      embeddings,
      repository,
    });

    expect(buildTrendCardMock).toHaveBeenCalledOnce();
    expect(buildTrendCardMock).toHaveBeenCalledWith(INPUT, warehouse);
    expect(repository.calls).toEqual([
      { card: CARD, embedding: [0.1, 0.2, 0.3] },
    ]);
    expect(result).toBe(CARD);
  });

  it("embeds the normalized seed (trim + lowercase) — identical to findSimilar", async () => {
    const embeddings = new FakeEmbeddingProvider();

    await ingestTrendCard(INPUT, {
      warehouse,
      embeddings,
      repository: new FakeRepository(),
    });

    expect(embeddings.seeds).toEqual(["retro halloween cats"]);
    expect(embeddings.seeds).not.toContain(CARD.seed);
  });

  it("still persists the card WITHOUT embedding when embedding fails", async () => {
    const embeddings = new FakeEmbeddingProvider(
      [0.1, 0.2, 0.3],
      new Error("embedding unavailable"),
    );
    const repository = new FakeRepository();

    await expect(
      ingestTrendCard(INPUT, { warehouse, embeddings, repository }),
    ).resolves.toBe(CARD);
    expect(repository.calls).toEqual([{ card: CARD, embedding: undefined }]);
  });

  it("propagates repository.save errors", async () => {
    const saveError = new Error("database unavailable");
    const repository = new FakeRepository(saveError);

    await expect(
      ingestTrendCard(INPUT, {
        warehouse,
        embeddings: new FakeEmbeddingProvider(),
        repository,
      }),
    ).rejects.toBe(saveError);
  });
});
