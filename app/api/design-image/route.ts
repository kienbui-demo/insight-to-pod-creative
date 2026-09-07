import {
  buildDesignImageDependencies,
  createDesignImageGetHandler,
} from "../../../src/integration/design-image-route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

let handler: ReturnType<typeof createDesignImageGetHandler> | undefined;

export async function GET(request: Request): Promise<Response> {
  handler ??= createDesignImageGetHandler(buildDesignImageDependencies());
  return handler(request);
}
