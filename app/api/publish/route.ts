import {
  buildPublishDependencies,
  createPublishPostHandler,
} from "../../../src/integration/publish-route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

let handler: ReturnType<typeof createPublishPostHandler> | undefined;

export async function POST(request: Request): Promise<Response> {
  handler ??= createPublishPostHandler(buildPublishDependencies());
  return handler(request);
}
