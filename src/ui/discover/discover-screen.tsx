"use client";

import type { TrendCard } from "../../../packages/contracts";
import { AppShell } from "../components/app-shell";
import { Badge } from "../components/ui-primitives";
import { TrendCardGrid } from "../trends/trend-card-grid";
import { SeedAuthoringPanel } from "./seed-authoring-panel";

const suggestions = ["Halloween", "Christmas", "Winter gifting", "US", "DE"];

export function DiscoverScreen({
  cards,
  source,
}: {
  cards: readonly TrendCard[];
  source: "live" | "empty";
}) {
  return (
    <AppShell>
      <section className="grid gap-8 lg:grid-cols-[1.2fr_0.8fr] lg:items-start">
        <div>
          <Badge>Early opportunity detection</Badge>
          <h1 className="mt-5 max-w-3xl text-4xl font-bold tracking-tight text-slate-950 sm:text-5xl">
            Find the next design opportunity before it gets crowded.
          </h1>
          <p className="mt-5 max-w-2xl text-lg leading-8 text-slate-600">
            Explore accelerating niches by market, holiday, and product type.
          </p>
          <div className="mt-6 flex flex-wrap gap-2" aria-label="Guided suggestions">
            {suggestions.map((suggestion) => (
              <span
                className="rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700"
                key={suggestion}
              >
                {suggestion}
              </span>
            ))}
          </div>
        </div>
        <SeedAuthoringPanel />
      </section>

      <section className="mt-14">
        <div className="flex items-end justify-between gap-4">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-amber-600">
              Rising now
            </p>
            <h2 className="mt-2 text-3xl font-bold tracking-tight text-slate-950">
              Trend Cards
            </h2>
          </div>
          <p className="text-sm text-slate-500">
            {source === "live"
              ? "Live warehouse"
              : "Warehouse not configured"}
          </p>
        </div>
        {cards.length === 0 ? (
          <p className="mt-8 rounded-2xl border border-slate-200 bg-white p-6 text-slate-600">
            No trend cards yet — run an ingestion job or a live scan.
          </p>
        ) : (
          <TrendCardGrid cards={cards} />
        )}
      </section>
    </AppShell>
  );
}
