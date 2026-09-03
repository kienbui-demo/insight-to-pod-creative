import { buildLiveDependencies } from "../../../src/integration/live-dependencies";
import { createLivePostHandler } from "../../../src/integration/live-route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

let handler: ReturnType<typeof createLivePostHandler> | undefined;

export async function POST(request: Request): Promise<Response> {
  handler ??= createLivePostHandler(buildLiveDependencies());
  return handler(request);
}
