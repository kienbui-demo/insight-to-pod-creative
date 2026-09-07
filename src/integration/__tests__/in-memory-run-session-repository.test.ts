import { describe, expect, it } from "vitest";

import { InMemoryRunSessionRepository } from "../in-memory-run-session-repository";

describe("InMemoryRunSessionRepository", () => {
  it("stores and returns a run-to-session mapping", async () => {
    const repository = new InMemoryRunSessionRepository();

    await expect(repository.findByRunId("run-1")).resolves.toBeNull();

    const saved = await repository.saveIfAbsent({
      runId: "run-1",
      maSessionId: "ma-session-1",
    });

    expect(saved).toEqual({
      runId: "run-1",
      maSessionId: "ma-session-1",
      createdAt: saved.createdAt,
      updatedAt: saved.updatedAt,
    });
    expect(saved.createdAt).toBe(saved.updatedAt);
    expect(Number.isNaN(Date.parse(saved.createdAt))).toBe(false);
    await expect(repository.findByRunId("run-1")).resolves.toBe(saved);
  });

  it("returns the original canonical mapping instead of overwriting it", async () => {
    const repository = new InMemoryRunSessionRepository();
    const original = await repository.saveIfAbsent({
      runId: "run-idempotent",
      maSessionId: "ma-session-canonical",
    });

    const repeated = await repository.saveIfAbsent({
      runId: "run-idempotent",
      maSessionId: "ma-session-must-not-replace",
    });

    expect(repeated).toBe(original);
    expect(repeated.maSessionId).toBe("ma-session-canonical");
    await expect(repository.findByRunId("run-idempotent")).resolves.toBe(
      original,
    );
  });
});
