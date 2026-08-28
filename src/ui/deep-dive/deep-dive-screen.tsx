import Link from "next/link";

import type { TrendCard } from "../../../packages/contracts";
import { AppShell } from "../components/app-shell";
import { Badge, Panel } from "../components/ui-primitives";
import { formatConfidence } from "../formatters";

const suggestedQuestions = [
  "Why is this opportunity rising?",
  "Which audience should I target?",
  "How can I differentiate the design?",
];

export function DeepDiveScreen({ card }: { card: TrendCard }) {
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
            <p className="mt-2 text-sm text-slate-600">
              Live MA responses will be connected during Phase C.
            </p>
          </div>
          <div className="mt-8 space-y-3">
            {suggestedQuestions.map((question) => (
              <div
                className="rounded-2xl border border-indigo-100 bg-indigo-50 px-4 py-3 text-sm font-medium text-indigo-900"
                key={question}
              >
                {question}
              </div>
            ))}
          </div>
          <div className="mt-auto rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-400">
            Ask about this opportunity…
          </div>
        </Panel>
      </div>
    </AppShell>
  );
}
