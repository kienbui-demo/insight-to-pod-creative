"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

import type { TrendCard } from "../../../packages/contracts";
import { AppShell } from "../components/app-shell";
import { Badge, Panel, primaryActionClass } from "../components/ui-primitives";
import { formatOpportunityScore } from "../formatters";
import { LiveTheater } from "../live-theater/live-theater";
import { createSseUiEventSource } from "../live-theater/sse-ui-event-source";

export function DesignStudioScreen({ card }: { card: TrendCard }) {
  const [started, setStarted] = useState(false);
  const [runId] = useState(() => crypto.randomUUID());
  const [idempotencyKey] = useState(() => `publish-${runId}`);
  const [designAssetUrl, setDesignAssetUrl] = useState<string>();
  const [publishState, setPublishState] = useState<
    "idle" | "publishing" | "published" | "error"
  >("idle");
  const [publishedUrl, setPublishedUrl] = useState<string>();
  const eventSource = useMemo(() => {
    if (!started) {
      return undefined;
    }

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
      },
      fetch: globalThis.fetch.bind(globalThis),
      maxReconnects: 1,
    });
  }, [card, runId, started]);

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
        <Panel className="p-6">
          <h2 className="text-xl font-semibold text-slate-950">Creative direction</h2>
          <dl className="mt-5 space-y-5 text-sm">
            <div>
              <dt className="font-medium text-slate-500">Concept</dt>
              <dd className="mt-1 text-slate-900">{card.recommendation.action}</dd>
            </div>
            <div>
              <dt className="font-medium text-slate-500">Product</dt>
              <dd className="mt-1 capitalize text-slate-900">{card.productType}</dd>
            </div>
            <div>
              <dt className="font-medium text-slate-500">Market</dt>
              <dd className="mt-1 text-slate-900">{card.market}</dd>
            </div>
          </dl>
        </Panel>

        <Panel className="overflow-hidden p-6">
          {started && eventSource ? (
            <LiveTheater
              eventSource={eventSource}
              onImageReady={setDesignAssetUrl}
            />
          ) : (
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
                onClick={() => setStarted(true)}
                type="button"
              >
                Generate design
              </button>
            </div>
          )}

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
    </AppShell>
  );
}
