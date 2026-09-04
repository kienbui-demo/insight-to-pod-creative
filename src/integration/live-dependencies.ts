import { Pool } from "pg";

import { ModelArkManagedAgentClient } from "../agent/modelark-managed-agent-client";
import * as modelarkLiveSessionModule from "../agent/modelark-live-session";
import { stubCrawlPort } from "../agent/stub-crawl-port";
import { PostgresTrendCardRepository } from "../storage/postgres-trend-card-repository";
import { alwaysMissTrendCardLookup } from "./always-miss-trend-card-lookup";
import { loadModelArkConfig } from "./env-config";
import { InMemoryRunSessionRepository } from "./in-memory-run-session-repository";
import type { MonetizedLiveDependencies } from "./live-route";
import { createModelArkEmbeddingProvider } from "./modelark-embedding-port";
import * as seedreamModule from "./modelark-seedream-image-port";
import { createPostgresQueryExecutor } from "./postgres-query-executor";
import { createRepositoryTrendCardLookup } from "./repository-trend-card-lookup";

export function buildLiveDependencies(
  env: NodeJS.ProcessEnv = process.env,
): MonetizedLiveDependencies {
  const config = loadModelArkConfig(env);
  const runSessions = new InMemoryRunSessionRepository();
  const client = new ModelArkManagedAgentClient({
    ...config,
    runSessions,
  });
  const seedream = seedreamModule.createModelArkSeedreamImagePort({
    baseUrl: config.baseUrl,
    apiKey: config.apiKey,
    model: config.seedreamModel,
  });
  const databaseUrl = env.DATABASE_URL;
  const lookup = databaseUrl
    ? createRepositoryTrendCardLookup(
        new PostgresTrendCardRepository(
          createPostgresQueryExecutor(
            new Pool({ connectionString: databaseUrl }),
          ),
          createModelArkEmbeddingProvider({
            baseUrl: config.baseUrl,
            apiKey: config.apiKey,
            model: config.embeddingModel,
          }),
        ),
      )
    : alwaysMissTrendCardLookup;
  const liveSessions = modelarkLiveSessionModule.createModelArkLiveSessionPort({
    client,
    crawl: stubCrawlPort,
    seedream,
    maxImagesPerAction: 1,
  });

  return {
    lookup,
    liveSessions,
  };
}
