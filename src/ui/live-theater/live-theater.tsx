"use client";

import { useEffect, useState } from "react";

import { formatCrawlSource, formatOpportunityScore } from "../formatters";
import {
  createInitialCreatorViewState,
  reduceCreatorViewState,
} from "./creator-view-state";
import type { UiEventSource } from "./event-source";

type LiveTheaterProps = {
  eventSource: UiEventSource;
};

export function LiveTheater({ eventSource }: LiveTheaterProps) {
  const [state, setState] = useState(createInitialCreatorViewState);

  useEffect(() => {
    let cancelled = false;

    async function consumeEvents() {
      for await (const event of eventSource.events()) {
        if (cancelled) {
          break;
        }

        setState((currentState) =>
          reduceCreatorViewState(currentState, event),
        );
      }
    }

    void consumeEvents();

    return () => {
      cancelled = true;
    };
  }, [eventSource]);

  const latestSource = state.scannedSources.at(-1);
  const latestImage = state.imageUrls.at(-1);

  let status = "Waiting to start";
  if (state.streamStatus === "done") {
    status = "Analysis complete";
  } else if (state.streamStatus === "failed") {
    status = "Analysis failed";
  } else if (state.stage === "scanning" && latestSource) {
    status = `Scanning ${formatCrawlSource(latestSource)}`;
  } else if (state.stage === "synthesizing") {
    status = "Synthesizing signals";
  } else if (state.stage === "image-ready") {
    status = "Image ready";
  } else if (state.stage === "card-ready") {
    status = "Trend card ready";
  }

  return (
    <section className="rounded-3xl border border-indigo-100 bg-white p-6 shadow-sm">
      <div className="flex items-center gap-3">
        <span className="h-2.5 w-2.5 rounded-full bg-amber-500" aria-hidden="true" />
        <h2 className="text-lg font-semibold text-slate-950">{status}</h2>
      </div>

      {state.synthesisNote && state.stage === "synthesizing" ? (
        <p className="mt-3 text-sm text-slate-600">{state.synthesisNote}</p>
      ) : null}

      {latestImage ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          alt="Generated preview"
          className="mt-5 aspect-video w-full rounded-2xl object-cover"
          src={latestImage}
        />
      ) : null}

      {state.card ? (
        <div className="mt-5 rounded-2xl bg-indigo-50 p-4">
          <p className="font-semibold text-indigo-950">{state.card.seed}</p>
          <p className="mt-1 text-sm font-medium text-indigo-700">
            {formatOpportunityScore(state.card.opportunityScore)}
          </p>
        </div>
      ) : null}

      {state.warnings.map((warning) => (
        <p
          className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900"
          key={warning}
          role="status"
        >
          {warning}
        </p>
      ))}

      {state.fatalError ? (
        <p className="mt-4 text-sm text-red-700" role="alert">
          {state.fatalError}
        </p>
      ) : null}
    </section>
  );
}
