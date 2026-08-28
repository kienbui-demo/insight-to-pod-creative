"use client";

import { useMemo } from "react";

import { AppShell } from "../components/app-shell";
import { Badge } from "../components/ui-primitives";
import { LiveTheater } from "../live-theater/live-theater";
import { createMockUiEventSource } from "../mocks/mock-ui-event-source";
import { TREND_CARDS } from "../mocks/trend-cards";
import { TrendCardTile } from "../trends/trend-card-tile";

const suggestions = ["Halloween", "Christmas", "Winter gifting", "US", "DE"];

export function DiscoverScreen() {
  const eventSource = useMemo(
    () => createMockUiEventSource(TREND_CARDS[0]),
    [],
  );

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
        <LiveTheater eventSource={eventSource} />
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
          <p className="text-sm text-slate-500">Mock warehouse snapshot</p>
        </div>
        <div className="mt-6 grid gap-6 md:grid-cols-2 xl:grid-cols-3">
          {TREND_CARDS.map((card) => (
            <TrendCardTile card={card} key={card.id} />
          ))}
        </div>
      </section>
    </AppShell>
  );
}
