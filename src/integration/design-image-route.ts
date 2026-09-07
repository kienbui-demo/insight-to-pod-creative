interface DesignImageDependencies {
  fetch: typeof fetch;
}

const ALLOWED_HOST_SUFFIX = ".tos-ap-southeast-1.volces.com";

function validSource(request: Request): string | undefined {
  const source = new URL(request.url).searchParams.get("src");
  if (!source) {
    return undefined;
  }

  try {
    const parsed = new URL(source);
    if (
      (parsed.protocol !== "http:" && parsed.protocol !== "https:") ||
      !parsed.hostname.endsWith(ALLOWED_HOST_SUFFIX)
    ) {
      return undefined;
    }
    return source;
  } catch {
    return undefined;
  }
}

export function createDesignImageGetHandler(
  dependencies: DesignImageDependencies,
) {
  return async function get(request: Request): Promise<Response> {
    const source = validSource(request);
    if (!source) {
      return new Response(null, { status: 400 });
    }

    let upstream: Response;
    try {
      upstream = await dependencies.fetch(source, { redirect: "manual" });
    } catch {
      return new Response(null, { status: 502 });
    }
    if (!upstream.ok) {
      return new Response(null, { status: 502 });
    }

    return new Response(upstream.body, {
      status: 200,
      headers: {
        "cache-control": "private, max-age=60",
        "content-type": upstream.headers.get("content-type") ?? "image/png",
      },
    });
  };
}

export function buildDesignImageDependencies(): DesignImageDependencies {
  return { fetch: globalThis.fetch.bind(globalThis) };
}
