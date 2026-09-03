import { beforeEach, describe, expect, it, vi } from "vitest";

const routeMocks = vi.hoisted(() => {
  const post = vi.fn<(request: Request) => Promise<Response>>();
  return {
    post,
    buildLiveDependencies: vi.fn<() => object>(),
    createLivePostHandler: vi.fn<(dependencies: object) => typeof post>(),
  };
});

vi.mock("../../../src/integration/live-dependencies", () => ({
  buildLiveDependencies: routeMocks.buildLiveDependencies,
}));

vi.mock("../../../src/integration/live-route", () => ({
  createLivePostHandler: routeMocks.createLivePostHandler,
}));

import { dynamic, POST, runtime } from "./route";

beforeEach(() => {
  routeMocks.post.mockReset();
  routeMocks.buildLiveDependencies.mockReset();
  routeMocks.createLivePostHandler.mockReset();

  routeMocks.buildLiveDependencies.mockReturnValue({
    lookup: "always-miss",
    liveSessions: "modelark",
  });
  routeMocks.createLivePostHandler.mockReturnValue(routeMocks.post);
  routeMocks.post.mockResolvedValue(new Response("ok", { status: 200 }));
});

describe("POST /api/live", () => {
  it("declares the Node.js dynamic route without building dependencies on import", () => {
    expect(runtime).toBe("nodejs");
    expect(dynamic).toBe("force-dynamic");
    expect(routeMocks.buildLiveDependencies).not.toHaveBeenCalled();
    expect(routeMocks.createLivePostHandler).not.toHaveBeenCalled();
  });

  it("lazily builds one handler and reuses it for later requests", async () => {
    const first = new Request("http://in-memory.test/api/live", {
      method: "POST",
    });
    const second = new Request("http://in-memory.test/api/live", {
      method: "POST",
    });

    await expect(POST(first)).resolves.toHaveProperty("status", 200);
    await expect(POST(second)).resolves.toHaveProperty("status", 200);

    expect(routeMocks.buildLiveDependencies).toHaveBeenCalledOnce();
    expect(routeMocks.createLivePostHandler).toHaveBeenCalledOnce();
    expect(routeMocks.post).toHaveBeenNthCalledWith(1, first);
    expect(routeMocks.post).toHaveBeenNthCalledWith(2, second);
  });
});
