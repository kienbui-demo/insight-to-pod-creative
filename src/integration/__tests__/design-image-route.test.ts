import { describe, expect, it, vi } from "vitest";

const TOS_IMAGE_URL =
  "https://ark-acg-ap-southeast-1.tos-ap-southeast-1.volces.com/img.png";

function designImageRequest(src?: string): Request {
  const url = new URL("http://localhost/api/design-image");
  if (src !== undefined) {
    url.searchParams.set("src", src);
  }
  return new Request(url, { method: "GET" });
}

describe("createDesignImageGetHandler", () => {
  it("streams bytes for a valid Seedream TOS host", async () => {
    const { createDesignImageGetHandler } = await import(
      "../design-image-route"
    );
    const fakeFetch = vi.fn<typeof fetch>(async () =>
      Promise.resolve(
        new Response(new Uint8Array([1, 2, 3]), {
          status: 200,
          headers: { "content-type": "image/png" },
        }),
      ),
    );
    const handler = createDesignImageGetHandler({ fetch: fakeFetch });

    const response = await handler(designImageRequest(TOS_IMAGE_URL));

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("image/png");
    expect(Array.from(new Uint8Array(await response.arrayBuffer()))).toEqual([
      1, 2, 3,
    ]);
    expect(fakeFetch).toHaveBeenCalledOnce();
    expect(fakeFetch.mock.calls[0][0]).toBe(TOS_IMAGE_URL);
  });

  it("rejects a non-TOS host with 400 and does not fetch", async () => {
    const { createDesignImageGetHandler } = await import(
      "../design-image-route"
    );
    const fakeFetch = vi.fn<typeof fetch>();
    const handler = createDesignImageGetHandler({ fetch: fakeFetch });

    const response = await handler(
      designImageRequest("https://evil.example/x.png"),
    );

    expect(response.status).toBe(400);
    expect(fakeFetch).not.toHaveBeenCalled();
  });

  it("rejects a missing src with 400", async () => {
    const { createDesignImageGetHandler } = await import(
      "../design-image-route"
    );
    const fakeFetch = vi.fn<typeof fetch>();
    const handler = createDesignImageGetHandler({ fetch: fakeFetch });

    const response = await handler(designImageRequest());

    expect(response.status).toBe(400);
    expect(fakeFetch).not.toHaveBeenCalled();
  });

  it("returns 502 when upstream fails", async () => {
    const { createDesignImageGetHandler } = await import(
      "../design-image-route"
    );
    const fakeFetch = vi.fn<typeof fetch>(async () =>
      Promise.resolve(new Response("no", { status: 404 })),
    );
    const handler = createDesignImageGetHandler({ fetch: fakeFetch });

    const response = await handler(designImageRequest(TOS_IMAGE_URL));

    expect(response.status).toBe(502);
  });
});
