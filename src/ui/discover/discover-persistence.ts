export type DiscoverTaskStatus = "in-progress" | "done" | "failed";

export type DiscoverTask = {
  id: string;
  runId: string;
  seed: string;
  market: string;
  productType: string;
  status: DiscoverTaskStatus;
  startedAt: string;
  cardId?: string;
};

export interface DiscoverTaskStore {
  load(): DiscoverTask[];
  save(task: DiscoverTask): void;
}

type StoragePort = Pick<Storage, "getItem" | "setItem">;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

function isDiscoverTask(value: unknown): value is DiscoverTask {
  return (
    isRecord(value) &&
    isNonEmptyString(value.id) &&
    isNonEmptyString(value.runId) &&
    isNonEmptyString(value.seed) &&
    isNonEmptyString(value.market) &&
    isNonEmptyString(value.productType) &&
    (value.status === "in-progress" ||
      value.status === "done" ||
      value.status === "failed") &&
    isNonEmptyString(value.startedAt) &&
    (value.cardId === undefined || isNonEmptyString(value.cardId))
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

const TASKS_STORAGE_KEY = "discover-tasks";

export function createSessionStorageDiscoverStore(
  storage?: StoragePort,
): DiscoverTaskStore {
  const resolvedStorage = resolveStorage(storage);

  function load(): DiscoverTask[] {
    try {
      const serialized = resolvedStorage.getItem(TASKS_STORAGE_KEY);
      if (serialized === null) {
        return [];
      }

      const parsed: unknown = JSON.parse(serialized);
      return Array.isArray(parsed) && parsed.every(isDiscoverTask) ? parsed : [];
    } catch {
      return [];
    }
  }

  return {
    load,
    save(task) {
      const tasks = load();
      const existingIndex = tasks.findIndex(
        (persisted) => persisted.id === task.id,
      );
      const nextTasks = [...tasks];

      if (existingIndex === -1) {
        nextTasks.push(task);
      } else {
        nextTasks[existingIndex] = task;
      }

      try {
        resolvedStorage.setItem(TASKS_STORAGE_KEY, JSON.stringify(nextTasks));
      } catch {
        // Persistence is best-effort when browser storage is unavailable.
      }
    },
  };
}
