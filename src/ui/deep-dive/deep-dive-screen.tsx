"use client";

import Link from "next/link";
import { type FormEvent, useRef, useState } from "react";

import type { TrendCard, UiEvent } from "../../../packages/contracts";
import { AppShell } from "../components/app-shell";
import { Badge, Panel, primaryActionClass } from "../components/ui-primitives";
import { formatConfidence } from "../formatters";
import type { UiEventSource } from "../live-theater/event-source";
import { LiveTheater } from "../live-theater/live-theater";
import { createRecordingUiEventSource } from "../live-theater/recording-ui-event-source";
import { createReplayUiEventSource } from "../live-theater/replay-ui-event-source";
import { createSseUiEventSource } from "../live-theater/sse-ui-event-source";
import {
  createSessionStorageTurnStore,
  type DeepDiveTurnStore,
  type PersistedTurn,
} from "./deep-dive-persistence";

const suggestedQuestions = [
  "Why is this opportunity rising?",
  "Which audience should I target?",
  "How can I differentiate the design?",
];

type DeepDiveTurn = PersistedTurn & {
  eventSource: UiEventSource;
};

function rehydrateTurn(turn: PersistedTurn): DeepDiveTurn {
  return {
    ...turn,
    eventSource: createReplayUiEventSource(turn.events),
  };
}

function persistedTurns(turns: DeepDiveTurn[]): PersistedTurn[] {
  return turns.map(({ runId, question, events }) => ({
    runId,
    question,
    events,
  }));
}

export function DeepDiveScreen({
  card,
  turnStore = createSessionStorageTurnStore(),
}: {
  card: TrendCard;
  turnStore?: DeepDiveTurnStore;
}) {
  const [question, setQuestion] = useState("");
  const [turns, setTurns] = useState<DeepDiveTurn[]>(() =>
    turnStore.load(card.id).map(rehydrateTurn),
  );
  const turnsRef = useRef(turns);

  function updateTurns(nextTurns: DeepDiveTurn[]): void {
    turnsRef.current = nextTurns;
    turnStore.save(card.id, persistedTurns(nextTurns));
    setTurns(nextTurns);
  }

  function recordEvent(runId: string, event: UiEvent): void {
    updateTurns(
      turnsRef.current.map((turn) =>
        turn.runId === runId
          ? { ...turn, events: [...turn.events, event] }
          : turn,
      ),
    );
  }

  function submitQuestion(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    const trimmedQuestion = question.trim();
    if (trimmedQuestion.length === 0) {
      return;
    }

    const runId = crypto.randomUUID();
    const liveEventSource = createSseUiEventSource({
      url: "/api/live",
      runId,
      request: {
        kind: "deep-dive",
        crawl: {
          source: "google_trends",
          market: card.market,
          seed: card.seed,
          productType: card.productType,
          mode: "live",
        },
        question: trimmedQuestion,
      },
      fetch: globalThis.fetch.bind(globalThis),
      maxReconnects: 1,
    });
    const eventSource = createRecordingUiEventSource({
      source: liveEventSource,
      onEvent: (streamedEvent) => recordEvent(runId, streamedEvent),
    });

    updateTurns([
      ...turnsRef.current,
      { runId, question: trimmedQuestion, events: [], eventSource },
    ]);
  }

  return (
    <AppShell>
      <div className="grid gap-6 lg:grid-cols-[0.7fr_1.3fr]">
        <Panel className="p-6">
          <Badge>Opportunity context</Badge>
          <h1 className="mt-4 text-3xl font-bold capitalize tracking-tight text-slate-950">
            {card.seed}
          </h1>
          <p className="mt-3 text-sm text-slate-600">
            {card.market} · {formatConfidence(card.confidence)} confidence
          </p>
          <p className="mt-6 text-sm leading-6 text-slate-700">
            {card.recommendation.reasoning}
          </p>
          <Link
            className="mt-6 inline-flex text-sm font-semibold text-[#4F46E5]"
            href={`/trends/${card.id}`}
          >
            Return to Trend Card →
          </Link>
        </Panel>

        <Panel className="flex min-h-[32rem] flex-col p-6">
          <div>
            <Badge>Secondary panel</Badge>
            <h2 className="mt-3 text-2xl font-semibold text-slate-950">Deep-dive chat</h2>
          </div>
          <div className="mt-8 space-y-3">
            {suggestedQuestions.map((suggestedQuestion) => (
              <button
                className="block w-full rounded-2xl border border-indigo-100 bg-indigo-50 px-4 py-3 text-left text-sm font-medium text-indigo-900 transition hover:border-indigo-200 hover:bg-indigo-100"
                key={suggestedQuestion}
                onClick={() => setQuestion(suggestedQuestion)}
                type="button"
              >
                {suggestedQuestion}
              </button>
            ))}
          </div>

          <div className="mt-6 space-y-6">
            {turns.length > 0 ? (
              turns.map((turn) => (
                <article className="space-y-3" key={turn.runId}>
                  <p className="rounded-2xl bg-slate-100 px-4 py-3 text-sm font-medium text-slate-900">
                    {turn.question}
                  </p>
                  <LiveTheater
                    eventSource={turn.eventSource}
                    key={turn.runId}
                  />
                </article>
              ))
            ) : (
              <p className="text-sm text-slate-600">
                Ask a question to start a live deep-dive.
              </p>
            )}
          </div>

          <form className="mt-auto flex gap-3 pt-6" onSubmit={submitQuestion}>
            <label className="sr-only" htmlFor="deep-dive-question">
              Ask about this opportunity
            </label>
            <input
              className="min-w-0 flex-1 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 placeholder:text-slate-400 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
              id="deep-dive-question"
              onChange={(event) => setQuestion(event.target.value)}
              placeholder="Ask about this opportunity…"
              type="text"
              value={question}
            />
            <button
              className={`${primaryActionClass} disabled:cursor-not-allowed disabled:opacity-50`}
              disabled={question.trim().length === 0}
              type="submit"
            >
              Ask
            </button>
          </form>
        </Panel>
      </div>
    </AppShell>
  );
}
