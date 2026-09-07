export type PersistedDesign = {
  runId: string;
  designAssetUrl: string;
  createdAt: string;
};

export type StudioRunStatus = "in-flight" | "done" | "error";

export type PersistedRun = {
  runId: string;
  status: StudioRunStatus;
  startedAt: string;
  designAssetUrl?: string;
};

export interface StudioHistoryStore {
  load(cardId: string): PersistedDesign[];
  append(cardId: string, design: PersistedDesign): void;
  loadRunId?(cardId: string): string | undefined;
  saveRunId?(cardId: string, runId: string): void;
  loadRuns?(cardId: string): PersistedRun[];
  saveRun?(cardId: string, run: PersistedRun): void;
}

type StoragePort = Pick<Storage, "getItem" | "setItem">;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

function isPersistedDesign(value: unknown): value is PersistedDesign {
  return (
    isRecord(value) &&
    isNonEmptyString(value.runId) &&
    isNonEmptyString(value.designAssetUrl) &&
    isNonEmptyString(value.createdAt)
  );
}

function isPersistedRun(value: unknown): value is PersistedRun {
  return (
    isRecord(value) &&
    isNonEmptyString(value.runId) &&
    (value.status === "in-flight" ||
      value.status === "done" ||
      value.status === "error") &&
    isNonEmptyString(value.startedAt) &&
    (value.designAssetUrl === undefined ||
      isNonEmptyString(value.designAssetUrl))
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

function historyStorageKey(cardId: string): string {
  return `studio-designs:${cardId}`;
}

function runIdStorageKey(cardId: string): string {
  return `studio-runid:${cardId}`;
}

function runsStorageKey(cardId: string): string {
  return `studio-runs:${cardId}`;
}

export function createSessionStorageStudioStore(
  storage?: StoragePort,
): StudioHistoryStore {
  const resolvedStorage = resolveStorage(storage);

  function load(cardId: string): PersistedDesign[] {
    try {
      const serialized = resolvedStorage.getItem(historyStorageKey(cardId));
      if (serialized === null) {
        return [];
      }

      const parsed: unknown = JSON.parse(serialized);
      return Array.isArray(parsed) && parsed.every(isPersistedDesign)
        ? parsed
        : [];
    } catch {
      return [];
    }
  }

  function loadRuns(cardId: string): PersistedRun[] {
    try {
      const serialized = resolvedStorage.getItem(runsStorageKey(cardId));
      if (serialized === null) {
        return [];
      }

      const parsed: unknown = JSON.parse(serialized);
      return Array.isArray(parsed) && parsed.every(isPersistedRun) ? parsed : [];
    } catch {
      return [];
    }
  }

  return {
    load,
    append(cardId, design) {
      const designs = load(cardId);
      if (
        designs.some(
          (persisted) => persisted.designAssetUrl === design.designAssetUrl,
        )
      ) {
        return;
      }

      try {
        resolvedStorage.setItem(
          historyStorageKey(cardId),
          JSON.stringify([...designs, design]),
        );
      } catch {
        // Persistence is best-effort when browser storage is unavailable.
      }
    },
    loadRunId(cardId) {
      try {
        const runId = resolvedStorage.getItem(runIdStorageKey(cardId));
        return isNonEmptyString(runId) ? runId : undefined;
      } catch {
        return undefined;
      }
    },
    saveRunId(cardId, runId) {
      try {
        resolvedStorage.setItem(runIdStorageKey(cardId), runId);
      } catch {
        // Persistence is best-effort when browser storage is unavailable.
      }
    },
    loadRuns,
    saveRun(cardId, run) {
      const runs = loadRuns(cardId);
      const existingIndex = runs.findIndex(
        (persisted) => persisted.runId === run.runId,
      );
      const nextRuns = [...runs];

      if (existingIndex === -1) {
        nextRuns.push(run);
      } else {
        nextRuns[existingIndex] = run;
      }

      try {
        resolvedStorage.setItem(runsStorageKey(cardId), JSON.stringify(nextRuns));
      } catch {
        // Persistence is best-effort when browser storage is unavailable.
      }
    },
  };
}
