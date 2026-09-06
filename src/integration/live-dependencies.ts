import { Pool } from "pg";

import { createMultiActorCrawlPort } from "../agent/apify-actors/multi-actor-crawl-port";
import { createApifyActorRegistry } from "../agent/apify-actors/registry";
import { ModelArkManagedAgentClient } from "../agent/modelark-managed-agent-client";
import * as modelarkLiveSessionModule from "../agent/modelark-live-session";
import { stubCrawlPort } from "../agent/stub-crawl-port";
import { PostgresSellerProjectRepository } from "../storage/postgres-seller-project-repository";
import { PostgresTrendCardRepository } from "../storage/postgres-trend-card-repository";
import { alwaysMissTrendCardLookup } from "./always-miss-trend-card-lookup";
import { loadApifyConfig, loadModelArkConfig } from "./env-config";
import { InMemoryRunSessionRepository } from "./in-memory-run-session-repository";
import type { MonetizedLiveDependencies } from "./live-route";
import { createModelArkEmbeddingProvider } from "./modelark-embedding-port";
import * as seedreamModule from "./modelark-seedream-image-port";
import { createPersistingLiveSessionPort } from "./persisting-live-session-port";
import { createPostgresQueryExecutor } from "./postgres-query-executor";
import { PostgresRunSessionRepository } from "./postgres-run-session-repository";
import { createRepositoryTrendCardLookup } from "./repository-trend-card-lookup";
import { DEMO_SELLER_ID } from "./demo-seller";

export function buildLiveDependencies(
  env: NodeJS.ProcessEnv = process.env,
): MonetizedLiveDependencies {
  const config = loadModelArkConfig(env);
  const databaseUrl = env.DATABASE_URL;
  const pool = databaseUrl
    ? new Pool({ connectionString: databaseUrl })
    : undefined;
  const executor = pool ? createPostgresQueryExecutor(pool) : undefined;
  const runSessions = executor
    ? new PostgresRunSessionRepository(executor)
    : new InMemoryRunSessionRepository();
  const client = new ModelArkManagedAgentClient({
    ...config,
    runSessions,
  });
  const seedream = seedreamModule.createModelArkSeedreamImagePort({
    baseUrl: config.baseUrl,
    apiKey: config.apiKey,
    model: config.seedreamModel,
  });
  const lookup = executor
    ? createRepositoryTrendCardLookup(
        new PostgresTrendCardRepository(
          executor,
          createModelArkEmbeddingProvider({
            baseUrl: config.baseUrl,
            apiKey: config.apiKey,
            model: config.embeddingModel,
          }),
        ),
      )
    : alwaysMissTrendCardLookup;
  const crawl =
    typeof env.APIFY_TOKEN === "string" && env.APIFY_TOKEN.length > 0
      ? createMultiActorCrawlPort({
          ...loadApifyConfig(env),
          registry: createApifyActorRegistry(),
        })
      : stubCrawlPort;
  const innerLiveSessions =
    modelarkLiveSessionModule.createModelArkLiveSessionPort({
      client,
      crawl,
      seedream,
      maxImagesPerAction: 1,
      lookup,
    });
  const liveSessions = executor
    ? createPersistingLiveSessionPort({
        inner: innerLiveSessions,
        projects: new PostgresSellerProjectRepository(executor),
        sellerId: DEMO_SELLER_ID,
      })
    : innerLiveSessions;

  return {
    lookup,
    liveSessions,
  };
}
