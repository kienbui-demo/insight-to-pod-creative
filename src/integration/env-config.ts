export interface ModelArkConfig {
  baseUrl: string;
  apiKey: string;
  agentId: string;
  agentVersion: number;
  environmentId: string;
  seedreamModel: string;
}

type ModelArkEnvKey =
  | "ARK_BASE_URL"
  | "ARK_API_KEY"
  | "ARK_AGENT_ID"
  | "ARK_AGENT_VERSION"
  | "ARK_ENVIRONMENT_ID";

function requiredEnv(env: NodeJS.ProcessEnv, key: ModelArkEnvKey): string {
  const value = env[key];
  if (value === undefined || value.length === 0) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return value;
}

export function loadModelArkConfig(
  env: NodeJS.ProcessEnv = process.env,
): ModelArkConfig {
  const baseUrl = requiredEnv(env, "ARK_BASE_URL");
  const apiKey = requiredEnv(env, "ARK_API_KEY");
  const agentId = requiredEnv(env, "ARK_AGENT_ID");
  const agentVersionValue = requiredEnv(env, "ARK_AGENT_VERSION");
  const environmentId = requiredEnv(env, "ARK_ENVIRONMENT_ID");
  const seedreamModel =
    env.ARK_SEEDREAM_MODEL || "seedream-5-0-lite-260128";
  const agentVersion = Number(agentVersionValue);

  if (!Number.isInteger(agentVersion) || agentVersion <= 0) {
    throw new Error("ARK_AGENT_VERSION must be a positive integer");
  }

  return {
    baseUrl,
    apiKey,
    agentId,
    agentVersion,
    environmentId,
    seedreamModel,
  };
}
