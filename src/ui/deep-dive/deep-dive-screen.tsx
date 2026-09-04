"use client";

import Link from "next/link";
import { type FormEvent, useMemo, useState } from "react";

import type { TrendCard } from "../../../packages/contracts";
import { AppShell } from "../components/app-shell";
import { Badge, Panel, primaryActionClass } from "../components/ui-primitives";
import { formatConfidence } from "../formatters";
import { LiveTheater } from "../live-theater/live-theater";
import { createSseUiEventSource } from "../live-theater/sse-ui-event-source";

const suggestedQuestions = [
  "Why is this opportunity rising?",
  "Which audience should I target?",
  "How can I differentiate the design?",
];

export function DeepDiveScreen({ card }: { card: TrendCard }) {
  const [runId] = useState(() => crypto.randomUUID());
  const [question, setQuestion] = useState("");
  const [submittedQuestion, setSubmittedQuestion] = useState<string>();
  const eventSource = useMemo(() => {
    if (!submittedQuestion) {
      return undefined;
    }

    return createSseUiEventSource({
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
        question: submittedQuestion,
      },
      fetch: globalThis.fetch.bind(globalThis),
      maxReconnects: 1,
    });
  }, [card, runId, submittedQuestion]);

  function submitQuestion(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    const trimmedQuestion = question.trim();
    if (trimmedQuestion.length === 0) {
      return;
    }

    setSubmittedQuestion(trimmedQuestion);
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

          <div className="mt-6">
            {eventSource ? (
              <LiveTheater eventSource={eventSource} />
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
