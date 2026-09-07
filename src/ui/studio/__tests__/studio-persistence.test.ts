import { describe, expect, it } from "vitest";

import {
  createSessionStorageStudioStore,
  type PersistedDesign,
  type PersistedRun,
} from "../studio-persistence";

type StoragePort = Pick<Storage, "getItem" | "setItem">;

function createStorage(): StoragePort {
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

const DESIGN = {
  runId: "run-studio-1",
  designAssetUrl: "https://tos.example/design.png",
  createdAt: "2026-09-07T01:00:00.000Z",
} satisfies PersistedDesign;

const RUN = {
  runId: "r1",
  status: "in-flight",
  startedAt: "2026-09-07T03:00:00.000Z",
} satisfies PersistedRun;

describe("createSessionStorageStudioStore", () => {
  it("returns an empty history for an unknown card", () => {
    const store = createSessionStorageStudioStore(createStorage());

    expect(store.load("unknown-card")).toEqual([]);
  });

  it("round-trips an appended design", () => {
    const store = createSessionStorageStudioStore(createStorage());

    store.append("trend-studio", DESIGN);

    expect(store.load("trend-studio")).toEqual([DESIGN]);
  });

  it("de-duplicates designs with the same asset URL", () => {
    const store = createSessionStorageStudioStore(createStorage());

    store.append("trend-studio", DESIGN);
    store.append("trend-studio", { ...DESIGN, runId: "run-studio-2" });

    expect(store.load("trend-studio")).toEqual([DESIGN]);
  });

  it("returns an empty history for corrupt JSON", () => {
    const storage: StoragePort = {
      getItem: () => "not-json",
      setItem: () => undefined,
    };
    const store = createSessionStorageStudioStore(storage);

    expect(store.load("trend-studio")).toEqual([]);
  });

  it("round-trips a saved run", () => {
    const store = createSessionStorageStudioStore(createStorage());

    store.saveRun?.("card", RUN);

    expect(store.loadRuns?.("card")).toEqual([RUN]);
  });

  it("upserts a run by runId (in-flight → done keeps one record)", () => {
    const store = createSessionStorageStudioStore(createStorage());
    const completedRun = {
      ...RUN,
      status: "done",
      designAssetUrl: "https://tos.example/r1.png",
    } satisfies PersistedRun;

    store.saveRun?.("card", RUN);
    store.saveRun?.("card", completedRun);

    expect(store.loadRuns?.("card")).toHaveLength(1);
    expect(store.loadRuns?.("card")).toEqual([completedRun]);
  });

  it("returns an empty run list for an unknown card", () => {
    const store = createSessionStorageStudioStore(createStorage());

    expect(store.loadRuns?.("nope")).toEqual([]);
  });

  it("returns an empty run list for corrupt JSON", () => {
    const storage: StoragePort = {
      getItem: () => "not-json",
      setItem: () => undefined,
    };
    const store = createSessionStorageStudioStore(storage);

    expect(store.loadRuns?.("trend-studio")).toEqual([]);
  });
});
