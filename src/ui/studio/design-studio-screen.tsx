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
  const eventSource = useMemo(() => {
    if (!started) {
      return undefined;
    }

    return createSseUiEventSource({
      url: "/api/live",
      runId: crypto.randomUUID(),
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
  }, [card, started]);

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
            <LiveTheater eventSource={eventSource} />
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
        </Panel>
      </div>
    </AppShell>
  );
}
