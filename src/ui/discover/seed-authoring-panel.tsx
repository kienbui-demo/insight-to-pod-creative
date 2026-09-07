"use client";

import { type FormEvent, useState } from "react";

import { Badge, Panel, primaryActionClass } from "../components/ui-primitives";
import type { UiEventSource } from "../live-theater/event-source";
import { LiveTheater } from "../live-theater/live-theater";
import { createSseUiEventSource } from "../live-theater/sse-ui-event-source";

const fieldClass =
  "mt-2 w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20";

export function SeedAuthoringPanel() {
  const [topic, setTopic] = useState("");
  const [market, setMarket] = useState("US");
  const [productType, setProductType] = useState("t-shirt");
  const [eventSource, setEventSource] = useState<UiEventSource>();

  function submitSeed(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    const trimmedTopic = topic.trim();
    if (trimmedTopic.length === 0) {
      return;
    }

    const runId = crypto.randomUUID();
    setEventSource(
      createSseUiEventSource({
        url: "/api/live",
        runId,
        request: {
          kind: "trend-card",
          crawl: {
            source: "google_trends",
            market,
            seed: trimmedTopic,
            productType,
            mode: "live",
          },
        },
        fetch: globalThis.fetch.bind(globalThis),
        maxReconnects: 1,
      }),
    );
  }

  return (
    <div className="space-y-4">
      <Panel className="p-6">
        <Badge>Author an opportunity</Badge>
        <h2 className="mt-3 text-2xl font-semibold text-slate-950">
          Create a Trend Card
        </h2>
        <p className="mt-2 text-sm leading-6 text-slate-600">
          Start with a topic, market, and product. We will reuse an existing
          card or run a live scan when the idea is new.
        </p>

        <form className="mt-6 space-y-4" onSubmit={submitSeed}>
          <div>
            <label
              className="text-sm font-medium text-slate-800"
              htmlFor="author-topic"
            >
              Topic
            </label>
            <input
              className={fieldClass}
              id="author-topic"
              onChange={(event) => setTopic(event.target.value)}
              placeholder="e.g. alpine folklore"
              type="text"
              value={topic}
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label
                className="text-sm font-medium text-slate-800"
                htmlFor="author-market"
              >
                Market
              </label>
              <select
                className={fieldClass}
                id="author-market"
                onChange={(event) => setMarket(event.target.value)}
                value={market}
              >
                <option value="US">US</option>
                <option value="DE">DE</option>
                <option value="GB">GB</option>
              </select>
            </div>

            <div>
              <label
                className="text-sm font-medium text-slate-800"
                htmlFor="author-product-type"
              >
                Product type
              </label>
              <select
                className={fieldClass}
                id="author-product-type"
                onChange={(event) => setProductType(event.target.value)}
                value={productType}
              >
                <option value="t-shirt">T-shirt</option>
                <option value="mug">Mug</option>
                <option value="poster">Poster</option>
              </select>
            </div>
          </div>

          <button
            className={`${primaryActionClass} w-full disabled:cursor-not-allowed disabled:opacity-50`}
            disabled={topic.trim().length === 0}
            type="submit"
          >
            Author trend card
          </button>
        </form>
      </Panel>

      {eventSource ? <LiveTheater eventSource={eventSource} /> : null}
    </div>
  );
}
