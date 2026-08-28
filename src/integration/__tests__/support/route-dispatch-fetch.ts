export type InMemoryRouteHandler = (
  request: Request,
) => Promise<Response> | Response;

export class RouteDispatchFetch {
  readonly requests: Request[] = [];

  constructor(private readonly handler: InMemoryRouteHandler) {}

  readonly fetch = async (
    input: RequestInfo | URL,
    init?: RequestInit,
  ): Promise<Response> => {
    const request = new Request(input, init);
    this.requests.push(request.clone());
    return this.handler(request);
  };
}
