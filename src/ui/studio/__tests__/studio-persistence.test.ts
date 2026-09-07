import { describe, expect, it } from "vitest";

import {
  createSessionStorageStudioStore,
  type PersistedDesign,
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
});
