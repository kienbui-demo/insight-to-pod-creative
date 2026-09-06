import { afterEach, describe, expect, it, vi } from "vitest";

import type { UiEvent } from "../../../packages/contracts";
import {
  createSessionStorageTurnStore,
  type PersistedTurn,
} from "./deep-dive-persistence";

function createMemoryStorage(): Pick<Storage, "getItem" | "setItem"> & {
  values: Map<string, string>;
} {
  const values = new Map<string, string>();
  return {
    values,
    getItem(key) {
      return values.get(key) ?? null;
    },
    setItem(key, value) {
      values.set(key, value);
    },
  };
}

const EVENTS = [
  { id: "answer-1", type: "answer", text: "Demand is accelerating." },
  { id: "done-1", type: "done" },
] satisfies UiEvent[];

const TURNS = [
  {
    runId: "run-1",
    question: "Why is this opportunity rising?",
    events: EVENTS,
  },
] satisfies PersistedTurn[];

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("createSessionStorageTurnStore", () => {
  it("round-trips turns under a card-specific key", () => {
    const storage = createMemoryStorage();
    const store = createSessionStorageTurnStore(storage);

    store.save("card-1", TURNS);

    expect(store.load("card-1")).toEqual(TURNS);
    expect(store.load("card-2")).toEqual([]);
    expect(storage.values.has("deep-dive-turns:card-1")).toBe(true);
  });

  it("returns an empty list for malformed persisted JSON", () => {
    const storage = createMemoryStorage();
    storage.setItem("deep-dive-turns:card-1", "{not-json");
    const store = createSessionStorageTurnStore(storage);

    expect(store.load("card-1")).toEqual([]);
  });

  it("does not throw when sessionStorage is unavailable", () => {
    vi.stubGlobal("sessionStorage", undefined);

    expect(() => {
      const store = createSessionStorageTurnStore();
      store.save("card-1", TURNS);
      store.load("card-1");
    }).not.toThrow();
  });
});
