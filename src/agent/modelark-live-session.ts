import type {
  BffRequest,
  LiveRun,
  LiveSessionPort,
  RawMaEvent,
  TrendCardLookupPort,
} from "../bff/types";
import type {
  CrawlSource,
  MetricObservation,
  MetricSink,
  TrendCard,
} from "../../packages/contracts";
import { NOOP_METRIC_SINK } from "../monitoring/no-op-metric-sink";
import { SafeMetricSink } from "../monitoring/safe-metric-sink";
import { writeStructuredLog } from "../monitoring/console-log-sink";
import { mapManagedAgentEvents } from "./ma-event-mapper";
import type {
  CrawlPort,
  CrawlPortInput,
  CrawlPortResult,
  ManagedAgentClientPort,
  ManagedAgentEvent,
  ManagedAgentSessionPort,
  SeedreamImagePort,
} from "./ports";
import { warehouseCrawlRecords } from "./warehouse-crawl-records";

interface CreateModelArkLiveSessionPortOptions {
  client: ManagedAgentClientPort;
  crawl?: CrawlPort;
  seedream: SeedreamImagePort;
  maxImagesPerAction: 1;
  metricSink?: MetricSink;
  lookup?: TrendCardLookupPort;
}

class AsyncEventQueue<T> implements AsyncIterable<T> {
  private readonly queued: T[] = [];
  private readonly waiters: Array<{
    resolve: (result: IteratorResult<T>) => void;
    reject: (error: unknown) => void;
  }> = [];
  private closed = false;
  private failure: unknown;

  push(value: T): void {
    if (this.closed) {
      return;
    }

    const waiter = this.waiters.shift();
    if (waiter) {
      waiter.resolve({ done: false, value });
    } else {
      this.queued.push(value);
    }
  }

  close(): void {
    if (this.closed) {
      return;
    }

    this.closed = true;
    this.flush();
  }

  fail(error: unknown): void {
    if (this.closed) {
      return;
    }

    this.failure = error;
    this.closed = true;
    this.flush();
  }

  [Symbol.asyncIterator](): AsyncIterator<T> {
    return {
      next: () => {
        const value = this.queued.shift();
        if (value !== undefined) {
          return Promise.resolve({ done: false, value });
        }
        if (this.failure !== undefined) {
          return Promise.reject(this.failure);
        }
        if (this.closed) {
          return Promise.resolve({ done: true, value: undefined });
        }
        return new Promise<IteratorResult<T>>((resolve, reject) => {
          this.waiters.push({ resolve, reject });
        });
      },
    };
  }

  private flush(): void {
    for (const waiter of this.waiters.splice(0)) {
      if (this.failure !== undefined) {
        waiter.reject(this.failure);
      } else {
        waiter.resolve({ done: true, value: undefined });
      }
    }
  }
}

class ModelArkLiveRun implements LiveRun {
  private readonly output = new AsyncEventQueue<RawMaEvent>();
  private readonly failedSources = new Set<CrawlSource>();
  private readonly failedSourceReasons = new Map<CrawlSource, string>();
  private readonly toolUses = new Map<string, ManagedAgentEvent>();
  private readonly fulfilledToolUses = new Set<string>();
  private crawlContext: Omit<CrawlPortInput, "source"> | undefined;
  private servedCard: TrendCard | undefined;
  private taskStartedAt: number | undefined;

  constructor(
    private readonly runId: string,
    private readonly session: ManagedAgentSessionPort,
    rawEvents: AsyncIterable<ManagedAgentEvent>,
    private readonly crawl: CrawlPort | undefined,
    private readonly seedream: SeedreamImagePort,
    private readonly metricSink: MetricSink,
    private readonly lookup: TrendCardLookupPort | undefined,
  ) {
    void this.pump(rawEvents);
  }

  async history(): Promise<readonly RawMaEvent[]> {
    const events = await this.session.history();
    return mapManagedAgentEvents(
      events.filter((event) => event.type !== "session.status_idle"),
    );
  }

  openEvents(signal?: AbortSignal): AsyncIterable<RawMaEvent> {
    if (signal?.aborted) {
      this.output.close();
    } else {
      signal?.addEventListener("abort", () => this.output.close(), { once: true });
    }
    return this.output;
  }

  async send(request: BffRequest): Promise<void> {
    this.taskStartedAt = performance.now();
    this.servedCard = undefined;
    if (
      (request.kind === "generate-design" || request.kind === "deep-dive") &&
      this.lookup !== undefined
    ) {
      try {
        const result = await this.lookup.lookup(request.crawl);
        if (result.kind === "hit") {
          this.servedCard = result.card;
        }
      } catch {
        // A lookup failure is a cache miss; the existing live crawl path remains available.
      }
    }
    const { source: _source, mode: _mode, ...crawlContext } = request.crawl;
    void _source;
    void _mode;
    this.crawlContext = crawlContext;
    await this.session.send(request);
  }

  async cancel(reason?: unknown): Promise<void> {
    await this.session.interrupt(reason);
    this.output.close();
  }

  private async pump(events: AsyncIterable<ManagedAgentEvent>): Promise<void> {
    try {
      for await (const event of events) {
        if (event.type === "agent.custom_tool_use") {
          this.toolUses.set(event.id, event);
        }
        if (event.type === "session.error" && event.error.source !== undefined) {
          this.failedSources.add(event.error.source);
          this.failedSourceReasons.set(
            event.error.source,
            event.error.message,
          );
        }
        if (event.type === "agent.output") {
          const card = event.output.card;
          for (const source of card.availableSources) {
            this.metricSink.record({
              name: "ptv_crawl_source_run_total",
              kind: "counter",
              value: 1,
              labels: {
                source,
                mode: "live",
                outcome: "success",
                stage: "final_card",
              },
              observedAt: new Date().toISOString(),
              observationId: `live-crawl:${event.id}:${source}`,
            });
            writeStructuredLog({
              step: "crawl_source",
              runId: this.runId,
              source,
              mode: "live",
              stage: "final_card",
              outcome: "success",
            });
          }
          for (const source of card.missingSources) {
            const failed = this.failedSources.has(source);
            const outcome = failed ? "failure" : "empty";
            const reason = failed
              ? (this.failedSourceReasons.get(source) ?? "source failed")
              : "no records returned";
            this.metricSink.record({
              name: "ptv_crawl_source_run_total",
              kind: "counter",
              value: 1,
              labels: {
                source,
                mode: "live",
                outcome,
                stage: "final_card",
              },
              observedAt: new Date().toISOString(),
              observationId: `live-crawl:${event.id}:${source}`,
            });
            writeStructuredLog({
              step: "crawl_source",
              runId: this.runId,
              source,
              mode: "live",
              stage: "final_card",
              outcome,
              reason,
            });
          }
          const buildOutcome =
            card.availableSources.length === 0
              ? "zero_evidence"
              : card.missingSources.length === 0
                ? "complete"
                : "degraded";
          this.metricSink.record({
            name: "ptv_trend_card_build_total",
            kind: "counter",
            value: 1,
            labels: {
              mode: "live",
              outcome: buildOutcome,
            },
            observedAt: new Date().toISOString(),
            observationId: `live-card:${event.id}`,
          });
          writeStructuredLog({
            step: "trend_card_build",
            runId: this.runId,
            outcome: buildOutcome,
            availableSourceCount: card.availableSources.length,
            missingSourceCount: card.missingSources.length,
            ...(this.taskStartedAt === undefined
              ? {}
              : {
                  durationMs: Math.max(
                    0,
                    performance.now() - this.taskStartedAt,
                  ),
                }),
          });
        }
        if (
          event.type === "session.status_idle" &&
          event.stop_reason.type === "end_turn"
        ) {
          this.output.close();
          return;
        }
        if (
          event.type === "session.status_idle" &&
          event.stop_reason.type === "requires_action"
        ) {
          const imageResultPromises = new Map<
            string,
            ReturnType<SeedreamImagePort["generate"]>
          >();
          for (const toolUseId of event.stop_reason.event_ids) {
            if (this.fulfilledToolUses.has(toolUseId)) {
              continue;
            }
            const toolUse = this.toolUses.get(toolUseId);
            if (
              toolUse?.type !== "agent.custom_tool_use" ||
              toolUse.name !== "generate_design_image"
            ) {
              continue;
            }
            const resultPromise = this.seedream.generate(toolUse.input);
            void resultPromise.catch(() => undefined);
            imageResultPromises.set(toolUseId, resultPromise);
          }

          for (const toolUseId of event.stop_reason.event_ids) {
            if (this.fulfilledToolUses.has(toolUseId)) {
              continue;
            }
            const toolUse = this.toolUses.get(toolUseId);
            if (toolUse?.type !== "agent.custom_tool_use") {
              continue;
            }
            if (toolUse.name === "crawl") {
              const crawlStartedAt = performance.now();
              const servedCard = this.servedCard;
              const result: CrawlPortResult =
                servedCard !== undefined
                  ? warehouseCrawlRecords(servedCard, toolUse.input.source)
                  : this.crawlContext === undefined || this.crawl === undefined
                    ? {
                        ok: false,
                        recoverable: false,
                        message: "crawl context unavailable",
                      }
                    : await this.crawl.fetch({
                        source: toolUse.input.source,
                        ...this.crawlContext,
                      });
              if (!result.ok) {
                this.failedSources.add(toolUse.input.source);
                this.failedSourceReasons.set(
                  toolUse.input.source,
                  result.message,
                );
              }
              const crawlOutcome = !result.ok
                ? "failure"
                : result.records.length === 0
                  ? "empty"
                  : "success";
              const crawlMetric = {
                name: "ptv_crawl_source_run_total",
                kind: "counter",
                value: 1,
                labels: {
                  source: toolUse.input.source,
                  mode: servedCard === undefined ? "live" : "warehouse",
                  outcome: crawlOutcome,
                  stage: "execute",
                },
                observedAt: new Date().toISOString(),
                observationId: `live-crawl:${toolUseId}:execute`,
              } as const;
              // P9 adds a warehouse execution label while the frozen C8 contract
              // still models only CrawlRequest modes ("batch" | "live").
              this.metricSink.record(crawlMetric as MetricObservation);
              writeStructuredLog({
                step: "crawl_source",
                runId: this.runId,
                source: toolUse.input.source,
                mode: servedCard === undefined ? "live" : "warehouse",
                stage: "execute",
                outcome: crawlOutcome,
                durationMs: Math.max(0, performance.now() - crawlStartedAt),
                ...(!result.ok
                  ? { reason: result.message }
                  : result.records.length === 0
                    ? { reason: "no records returned" }
                    : {}),
              });

              const resultEvent = {
                id: `${toolUseId}:result`,
                type: "user.custom_tool_result",
                custom_tool_use_id: toolUseId,
                name: "crawl",
                input: { source: toolUse.input.source },
                result,
              } satisfies ManagedAgentEvent;
              await this.session.submitCustomToolResult(resultEvent);
              this.fulfilledToolUses.add(toolUseId);
              for (const mapped of mapManagedAgentEvents([resultEvent])) {
                this.output.push(mapped);
              }
              continue;
            }

            const imageResultPromise = imageResultPromises.get(toolUseId);
            if (
              toolUse.name !== "generate_design_image" ||
              imageResultPromise === undefined
            ) {
              continue;
            }

            const resultEvent = {
              id: `${toolUseId}:result`,
              type: "user.custom_tool_result",
              custom_tool_use_id: toolUseId,
              name: "generate_design_image",
              input: toolUse.input,
              result: await imageResultPromise,
            } satisfies ManagedAgentEvent;
            await this.session.submitCustomToolResult(resultEvent);
            this.fulfilledToolUses.add(toolUseId);
            for (const mapped of mapManagedAgentEvents([resultEvent])) {
              this.output.push(mapped);
            }
          }
          continue;
        }

        if (
          event.type === "agent.custom_tool_use" &&
          event.name === "crawl" &&
          this.servedCard !== undefined
        ) {
          // Warehouse-served crawl: data comes from the warehouse, so do not
          // surface a "scanning" UI event for this crawl tool-use.
          continue;
        }
        for (const mapped of mapManagedAgentEvents([event])) {
          this.output.push(mapped);
        }
      }
      this.output.close();
    } catch (error) {
      writeStructuredLog({
        step: "live_session",
        runId: this.runId,
        outcome: "error",
        reason: error instanceof Error ? error.message : String(error),
      });
      this.output.fail(error);
    }
  }
}

export function createModelArkLiveSessionPort(
  options: CreateModelArkLiveSessionPortOptions,
): LiveSessionPort {
  const metricSink = new SafeMetricSink(
    options.metricSink ?? NOOP_METRIC_SINK,
  );
  return {
    async create(runId: string): Promise<LiveRun> {
      const session = await options.client.attachOrCreate(runId);
      const rawEvents = session.openEvents();
      return new ModelArkLiveRun(
        runId,
        session,
        rawEvents,
        options.crawl,
        options.seedream,
        metricSink,
        options.lookup,
      );
    },
  };
}
