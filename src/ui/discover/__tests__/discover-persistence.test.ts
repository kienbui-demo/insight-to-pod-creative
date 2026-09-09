import { describe, expect, it } from "vitest";

import {
  createSessionStorageDiscoverStore,
  type DiscoverTask,
} from "../discover-persistence";

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

const TASK = {
  id: "run-discover-1",
  runId: "run-discover-1",
  seed: "alpine folklore",
  market: "US",
  productType: "t-shirt",
  status: "in-progress",
  startedAt: "2026-09-09T01:00:00.000Z",
} satisfies DiscoverTask;

describe("createSessionStorageDiscoverStore", () => {
  it("returns an empty task list for a fresh store", () => {
    const store = createSessionStorageDiscoverStore(createStorage());

    expect(store.load()).toEqual([]);
  });

  it("round-trips a saved task", () => {
    const store = createSessionStorageDiscoverStore(createStorage());

    store.save(TASK);

    expect(store.load()).toEqual([TASK]);
  });

  it("upserts by id (in-progress to done keeps one record)", () => {
    const store = createSessionStorageDiscoverStore(createStorage());
    const completedTask = {
      ...TASK,
      status: "done",
      cardId: "card-xyz",
    } satisfies DiscoverTask;

    store.save(TASK);
    store.save(completedTask);

    expect(store.load()).toHaveLength(1);
    expect(store.load()).toEqual([completedTask]);
  });

  it("returns an empty task list for corrupt JSON", () => {
    const storage: StoragePort = {
      getItem: () => "not-json",
      setItem: () => undefined,
    };
    const store = createSessionStorageDiscoverStore(storage);

    expect(store.load()).toEqual([]);
  });
});
