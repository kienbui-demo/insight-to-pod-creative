import { describe, expect, it, vi } from "vitest";

import { resolveRunSession } from "../run-session-coordinator";
import { InMemoryRunSessionRepository } from "./support/fake-run-session-repository";

describe("C1 durable runId to MA session mapping", () => {
  it("creates and persists a mapping on first use of a runId", async () => {
    const repository = new InMemoryRunSessionRepository();
    const createMaSession = vi.fn(async () => "ma-session-first");

    await expect(repository.findByRunId("run-first")).resolves.toBeNull();

    const mapping = await resolveRunSession({
      runId: "run-first",
      repository,
      createMaSession,
    });

    expect(mapping.maSessionId).toBe("ma-session-first");
    await expect(repository.findByRunId("run-first")).resolves.toEqual(mapping);
    expect(createMaSession).toHaveBeenCalledOnce();
  });

  it("reuses the same persisted MA session for the same runId", async () => {
    const repository = new InMemoryRunSessionRepository();
    const createMaSession = vi
      .fn<() => Promise<string>>()
      .mockResolvedValueOnce("ma-session-canonical")
      .mockResolvedValueOnce("ma-session-must-not-be-created");

    const first = await resolveRunSession({
      runId: "run-reused",
      repository,
      createMaSession,
    });
    const second = await resolveRunSession({
      runId: "run-reused",
      repository,
      createMaSession,
    });

    expect(second).toEqual(first);
    expect(second.maSessionId).toBe("ma-session-canonical");
    expect(createMaSession).toHaveBeenCalledOnce();
  });

  it("creates distinct mappings for different runIds", async () => {
    const repository = new InMemoryRunSessionRepository();
    const createMaSession = vi
      .fn<() => Promise<string>>()
      .mockResolvedValueOnce("ma-session-a")
      .mockResolvedValueOnce("ma-session-b");

    const first = await resolveRunSession({
      runId: "run-a",
      repository,
      createMaSession,
    });
    const second = await resolveRunSession({
      runId: "run-b",
      repository,
      createMaSession,
    });

    expect(first.maSessionId).toBe("ma-session-a");
    expect(second.maSessionId).toBe("ma-session-b");
    expect(first.runId).not.toBe(second.runId);
  });

  it("converges concurrent saveIfAbsent calls on one canonical mapping", async () => {
    const repository = new InMemoryRunSessionRepository();

    const [first, second] = await Promise.all([
      repository.saveIfAbsent({
        runId: "run-race",
        maSessionId: "ma-session-winner",
      }),
      repository.saveIfAbsent({
        runId: "run-race",
        maSessionId: "ma-session-loser",
      }),
    ]);

    expect(first).toEqual(second);
    expect(first.maSessionId).toBe("ma-session-winner");
    await expect(repository.findByRunId("run-race")).resolves.toEqual(first);
  });

  it("does not persist a mapping when MA session creation fails", async () => {
    const repository = new InMemoryRunSessionRepository();
    const createMaSession = vi.fn(async () => {
      throw new Error("MA session creation failed");
    });

    await expect(
      resolveRunSession({
        runId: "run-failed",
        repository,
        createMaSession,
      }),
    ).rejects.toThrow("MA session creation failed");
    await expect(repository.findByRunId("run-failed")).resolves.toBeNull();
  });
});
