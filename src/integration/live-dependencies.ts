import { ModelArkManagedAgentClient } from "../agent/modelark-managed-agent-client";
import * as modelarkLiveSessionModule from "../agent/modelark-live-session";
import { alwaysMissTrendCardLookup } from "./always-miss-trend-card-lookup";
import { loadModelArkConfig } from "./env-config";
import { InMemoryRunSessionRepository } from "./in-memory-run-session-repository";
import type { MonetizedLiveDependencies } from "./live-route";
import * as seedreamModule from "./modelark-seedream-image-port";

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
  const liveSessions = modelarkLiveSessionModule.createModelArkLiveSessionPort({
    client,
    seedream,
    maxImagesPerAction: 1,
  });

  return {
    lookup: alwaysMissTrendCardLookup,
    liveSessions,
  };
}
