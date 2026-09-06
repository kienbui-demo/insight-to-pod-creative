import type { UiEvent } from "../../../packages/contracts";

export type PersistedTurn = {
  runId: string;
  question: string;
  events: UiEvent[];
};

export interface DeepDiveTurnStore {
  load(cardId: string): PersistedTurn[];
  save(cardId: string, turns: PersistedTurn[]): void;
}

type StoragePort = Pick<Storage, "getItem" | "setItem">;

const CRAWL_SOURCES = new Set([
  "google_trends",
  "reddit",
  "pinterest",
  "tiktok",
  "amazon",
  "etsy",
  "meta_ads",
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isUiEvent(value: unknown): value is UiEvent {
  if (!isRecord(value) || typeof value.id !== "string") {
    return false;
  }

  switch (value.type) {
    case "scanning":
      return CRAWL_SOURCES.has(String(value.source));
    case "synthesizing":
      return value.note === undefined || typeof value.note === "string";
    case "image:ready":
      return typeof value.url === "string";
    case "card:ready":
      return isRecord(value.card);
    case "answer":
      return typeof value.text === "string";
    case "error":
      return (
        typeof value.recoverable === "boolean" &&
        typeof value.message === "string"
      );
    case "done":
      return true;
    default:
      return false;
  }
}

function isPersistedTurn(value: unknown): value is PersistedTurn {
  return (
    isRecord(value) &&
    typeof value.runId === "string" &&
    typeof value.question === "string" &&
    Array.isArray(value.events) &&
    value.events.every(isUiEvent)
  );
}

function createMemoryStorage(): StoragePort {
  const values = new Map<string, string>();
  return {
    getItem(key) {
      return values.get(key) ?? null;
    },
    setItem(key, value) {
      values.set(key, value);
    },
  };
}

function resolveStorage(storage?: StoragePort): StoragePort {
  if (storage) {
    return storage;
  }

  try {
    if (typeof globalThis.sessionStorage !== "undefined") {
      return globalThis.sessionStorage;
    }
  } catch {
    // Browser privacy settings can make sessionStorage access throw.
  }

  return createMemoryStorage();
}

function storageKey(cardId: string): string {
  return `deep-dive-turns:${cardId}`;
}

export function createSessionStorageTurnStore(
  storage?: StoragePort,
): DeepDiveTurnStore {
  const resolvedStorage = resolveStorage(storage);

  return {
    load(cardId) {
      try {
        const serialized = resolvedStorage.getItem(storageKey(cardId));
        if (serialized === null) {
          return [];
        }

        const parsed: unknown = JSON.parse(serialized);
        return Array.isArray(parsed) && parsed.every(isPersistedTurn)
          ? parsed
          : [];
      } catch {
        return [];
      }
    },
    save(cardId, turns) {
      try {
        resolvedStorage.setItem(storageKey(cardId), JSON.stringify(turns));
      } catch {
        // Persistence is best-effort when browser storage is unavailable.
      }
    },
  };
}
