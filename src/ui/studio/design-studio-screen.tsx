"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import type { TrendCard } from "../../../packages/contracts";
import { AppShell } from "../components/app-shell";
import { Badge, Panel, primaryActionClass } from "../components/ui-primitives";
import { formatOpportunityScore } from "../formatters";
import { LiveTheater } from "../live-theater/live-theater";
import { createSseUiEventSource } from "../live-theater/sse-ui-event-source";
import {
  createSessionStorageStudioStore,
  type PersistedDesign,
  type PersistedRun,
  type StudioHistoryStore,
} from "./studio-persistence";

function mostRecentRun(runs: PersistedRun[]): PersistedRun | undefined {
  return runs.reduce<PersistedRun | undefined>(
    (latest, run) =>
      latest === undefined || run.startedAt > latest.startedAt ? run : latest,
    undefined,
  );
}

function upsertRun(runs: PersistedRun[], run: PersistedRun): PersistedRun[] {
  const existingIndex = runs.findIndex(
    (persisted) => persisted.runId === run.runId,
  );
  if (existingIndex === -1) {
    return [...runs, run];
  }

  const nextRuns = [...runs];
  nextRuns[existingIndex] = run;
  return nextRuns;
}

export function DesignStudioScreen({
  card,
  historyStore = createSessionStorageStudioStore(),
}: {
  card: TrendCard;
  historyStore?: StudioHistoryStore;
}) {
  const [started, setStarted] = useState(false);
  const [streaming, setStreaming] = useState(false);
  const [sellerPrompt, setSellerPrompt] = useState("");
  const [runId, setRunId] = useState(() => crypto.randomUUID());
  const [runIdIsFresh, setRunIdIsFresh] = useState(true);
  const [runStartedAt, setRunStartedAt] = useState<string>();
  const [designAssetUrl, setDesignAssetUrl] = useState<string>();
  const [designHistory, setDesignHistory] = useState<PersistedDesign[]>([]);
  const [taskHistory, setTaskHistory] = useState<PersistedRun[]>([]);
  const [publishState, setPublishState] = useState<
    "idle" | "publishing" | "published" | "error"
  >("idle");
  const [publishedUrl, setPublishedUrl] = useState<string>();
  const idempotencyKey = `publish-${runId}`;

  useEffect(() => {
    const restored = historyStore.load(card.id);
    const restoredRunId = historyStore.loadRunId?.(card.id) ?? restored[0]?.runId;

    setDesignHistory(restored);
    if (typeof historyStore.loadRuns === "function") {
      const restoredRuns = historyStore.loadRuns(card.id);
      const runToResume =
        mostRecentRun(
          restoredRuns.filter((run) => run.status === "in-flight"),
        ) ?? mostRecentRun(restoredRuns);

      setTaskHistory(restoredRuns);
      if (runToResume) {
        setRunId(runToResume.runId);
        setRunIdIsFresh(false);
        setRunStartedAt(runToResume.startedAt);
        setDesignAssetUrl(runToResume.designAssetUrl);
        setStarted(true);
        setStreaming(runToResume.status === "in-flight");
        return;
      }
    }

    if (restoredRunId) {
      setRunId(restoredRunId);
      setRunIdIsFresh(false);
    } else {
      historyStore.saveRunId?.(card.id, runId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reload only on mount or card change
  }, [card.id]);

  const eventSource = useMemo(() => {
    if (!streaming) {
      return undefined;
    }

    const trimmedPrompt = sellerPrompt.trim();

    return createSseUiEventSource({
      url: "/api/live",
      runId,
      request: {
        kind: "generate-design",
        crawl: {
          source: "google_trends",
          market: card.market,
          seed: card.seed,
          productType: card.productType,
          mode: "live",
        },
        ...(trimmedPrompt.length > 0
          ? { sellerPrompt: trimmedPrompt }
          : {}),
      },
      fetch: globalThis.fetch.bind(globalThis),
      maxReconnects: 1,
    });
  }, [card, runId, sellerPrompt, streaming]);

  function startRun(): void {
    let nextRunId = runId;
    if (!runIdIsFresh) {
      nextRunId = crypto.randomUUID();
      setRunId(nextRunId);
      setRunIdIsFresh(true);
      historyStore.saveRunId?.(card.id, nextRunId);
    }

    const startedAt = new Date().toISOString();
    const run = {
      runId: nextRunId,
      status: "in-flight",
      startedAt,
    } satisfies PersistedRun;

    setRunStartedAt(startedAt);
    setDesignAssetUrl(undefined);
    historyStore.saveRun?.(card.id, run);
    setTaskHistory((current) => upsertRun(current, run));
    setStarted(true);
    setStreaming(true);
  }

  function recordDesign(url: string): void {
    const completedAt = new Date().toISOString();
    const design = {
      runId,
      designAssetUrl: url,
      createdAt: completedAt,
    } satisfies PersistedDesign;
    const completedRun = {
      runId,
      status: "done",
      startedAt: runStartedAt ?? completedAt,
      designAssetUrl: url,
    } satisfies PersistedRun;

    setDesignAssetUrl(url);
    historyStore.append(card.id, design);
    historyStore.saveRun?.(card.id, completedRun);
    setDesignHistory((current) =>
      current.some((persisted) => persisted.designAssetUrl === url)
        ? current
        : [...current, design],
    );
    setTaskHistory((current) => upsertRun(current, completedRun));
  }

  function reopenRun(run: PersistedRun): void {
    setRunId(run.runId);
    setRunIdIsFresh(false);
    setRunStartedAt(run.startedAt);
    setDesignAssetUrl(run.designAssetUrl);
    setStarted(true);
    setStreaming(run.status === "in-flight");
  }

  async function publishDesign(): Promise<void> {
    if (!designAssetUrl || publishState === "publishing") {
      return;
    }

    setPublishState("publishing");
    setPublishedUrl(undefined);
    try {
      const response = await globalThis.fetch("/api/publish", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          projectId: runId,
          idempotencyKey,
          design: {
            assetUrl: designAssetUrl,
            title: card.seed,
            description: card.recommendation.action,
            tags: [],
            market: card.market,
            productType: card.productType,
          },
        }),
      });
      if (!response.ok) {
        setPublishState("error");
        return;
      }

      const result = (await response.json()) as unknown;
      if (
        typeof result === "object" &&
        result !== null &&
        "publication" in result &&
        typeof result.publication === "object" &&
        result.publication !== null &&
        "publishedUrl" in result.publication &&
        typeof result.publication.publishedUrl === "string"
      ) {
        setPublishedUrl(result.publication.publishedUrl);
      }
      setPublishState("published");
    } catch {
      setPublishState("error");
    }
  }

  return (
    <AppShell>
      <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <Badge>Design Studio</Badge>
          <h1 className="mt-4 text-4xl font-bold tracking-tight text-slate-950">
            Turn “<span className="capitalize">{card.seed}</span>” into a draft.
          </h1>
          <p className="mt-3 text-slate-600">
            Opportunity {formatOpportunityScore(card.opportunityScore)}
          </p>
        </div>
        <Link className={primaryActionClass} href={`/deep-dive/${card.id}`}>
          Ask a deep-dive question
        </Link>
      </div>

      <div className="mt-8 grid gap-6 lg:grid-cols-[0.75fr_1.25fr]">
        <div className="space-y-6">
          <Panel aria-label="Draft design concept" className="p-6">
            <h2 className="text-xl font-semibold text-slate-950">
              Draft design concept
            </h2>
            <p className="mt-5 text-sm leading-6 text-slate-900">
              {card.recommendation.action}
            </p>
            <p className="mt-3 text-sm leading-6 text-slate-600">
              {card.recommendation.reasoning}
            </p>
            <button
              aria-label="Generate design from concept"
              className={`${primaryActionClass} mt-5`}
              onClick={startRun}
              type="button"
            >
              Generate design
            </button>
            <dl className="mt-5 grid grid-cols-2 gap-5 text-sm">
              <div>
                <dt className="font-medium text-slate-500">Product</dt>
                <dd className="mt-1 capitalize text-slate-900">
                  {card.productType}
                </dd>
              </div>
              <div>
                <dt className="font-medium text-slate-500">Market</dt>
                <dd className="mt-1 text-slate-900">{card.market}</dd>
              </div>
            </dl>
          </Panel>

          <Panel className="p-6">
            <label
              className="text-xl font-semibold text-slate-950"
              htmlFor="seller-prompt"
            >
              Your prompt
            </label>
            <textarea
              className="mt-4 min-h-32 w-full resize-y rounded-xl border border-slate-300 px-3 py-2 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200"
              id="seller-prompt"
              onChange={(event) => setSellerPrompt(event.target.value)}
              placeholder="Describe the design you want"
              value={sellerPrompt}
            />
            <p className="mt-2 text-sm leading-6 text-slate-500">
              Leave blank to let the agent draft it from the concept above.
            </p>
          </Panel>

          {typeof historyStore.loadRuns === "function" &&
          taskHistory.length > 0 ? (
            <Panel aria-label="Task history" className="p-6">
              <h2 className="text-xl font-semibold text-slate-950">
                Task history
              </h2>
              <div className="mt-5 space-y-3">
                {[...taskHistory]
                  .sort((left, right) =>
                    right.startedAt.localeCompare(left.startedAt),
                  )
                  .map((run) => (
                    <button
                      className="w-full rounded-2xl border border-slate-200 p-4 text-left transition hover:border-indigo-300 hover:bg-indigo-50"
                      key={run.runId}
                      onClick={() => reopenRun(run)}
                      type="button"
                    >
                      <span className="block text-sm font-semibold text-slate-900">
                        {run.runId}
                      </span>
                      <span className="mt-1 block text-sm capitalize text-slate-500">
                        {run.status}
                      </span>
                    </button>
                  ))}
              </div>
            </Panel>
          ) : null}
        </div>

        <Panel className="overflow-hidden p-6">
          {streaming && eventSource ? (
            <LiveTheater
              eventSource={eventSource}
              onImageReady={recordDesign}
            />
          ) : !started ? (
            <div className="flex min-h-72 flex-col items-center justify-center rounded-2xl bg-indigo-50 p-8 text-center">
              <h2 className="text-xl font-semibold text-slate-950">
                Generate your first draft
              </h2>
              <p className="mt-3 max-w-md text-sm leading-6 text-slate-600">
                Start the live design flow using this opportunity and creative
                direction.
              </p>
              <button
                className={`${primaryActionClass} mt-6`}
                onClick={startRun}
                type="button"
              >
                Generate design
              </button>
            </div>
          ) : null}

          {started ? (
            <div
              aria-label="Design result"
              className="mt-5 rounded-2xl border border-slate-200 bg-slate-50 p-5"
            >
              {designAssetUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  alt="Generated design"
                  className="aspect-square w-full rounded-2xl object-cover"
                  src={`/api/design-image?src=${encodeURIComponent(designAssetUrl)}`}
                />
              ) : streaming ? (
                <div role="status">
                  <p className="text-sm font-medium text-slate-700">
                    {"Đang tạo ảnh thiết kế ..."}
                  </p>
                  <div
                    aria-hidden="true"
                    className="mt-3 h-2 overflow-hidden rounded-full bg-indigo-100"
                  >
                    <div className="h-full w-2/3 animate-pulse rounded-full bg-indigo-600" />
                  </div>
                </div>
              ) : (
                <p className="text-sm text-slate-500">
                  No design image is available for this run.
                </p>
              )}
            </div>
          ) : null}

          <div className="mt-5 border-t border-slate-200 pt-5">
            <button
              className={`${primaryActionClass} disabled:cursor-not-allowed disabled:opacity-50`}
              disabled={!designAssetUrl || publishState === "publishing"}
              onClick={() => void publishDesign()}
              type="button"
            >
              {publishState === "publishing"
                ? "Publishing…"
                : "Publish to Printerval"}
            </button>
            {publishState === "published" ? (
              <p className="mt-3 text-sm font-medium text-emerald-700" role="status">
                Published to Printerval successfully.
                {publishedUrl ? (
                  <>
                    {" "}
                    <a
                      className="underline underline-offset-2"
                      href={publishedUrl}
                    >
                      View publication
                    </a>
                  </>
                ) : null}
              </p>
            ) : null}
            {publishState === "error" ? (
              <p className="mt-3 text-sm text-red-700" role="alert">
                Publishing failed. Please try again.
              </p>
            ) : null}
          </div>
        </Panel>
      </div>

      <Panel aria-label="Design history" className="mt-6 p-6">
        <h2 className="text-xl font-semibold text-slate-950">Previous designs</h2>
        {designHistory.length > 0 ? (
          <div className="mt-5 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
            {designHistory.map((design) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                alt={`Generated design for ${card.seed}`}
                className="aspect-square w-full rounded-2xl border border-slate-200 object-cover"
                key={design.designAssetUrl}
                src={design.designAssetUrl}
              />
            ))}
          </div>
        ) : (
          <p className="mt-3 text-sm text-slate-500">No designs generated yet.</p>
        )}
      </Panel>
    </AppShell>
  );
}
