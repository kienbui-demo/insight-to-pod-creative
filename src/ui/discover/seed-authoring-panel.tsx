"use client";

import { useRouter } from "next/navigation";
import {
  type FormEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";

import { Badge, Panel, primaryActionClass } from "../components/ui-primitives";
import type { UiEventSource } from "../live-theater/event-source";
import { createSseUiEventSource } from "../live-theater/sse-ui-event-source";
import {
  createSessionStorageDiscoverStore,
  type DiscoverTask,
  type DiscoverTaskStore,
} from "./discover-persistence";

const fieldClass =
  "mt-2 w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20";

function createTaskEventSource(task: DiscoverTask): UiEventSource {
  return createSseUiEventSource({
    url: "/api/live",
    runId: task.runId,
    request: {
      kind: "trend-card",
      crawl: {
        source: "google_trends",
        market: task.market,
        seed: task.seed,
        productType: task.productType,
        mode: "live",
      },
    },
    fetch: globalThis.fetch.bind(globalThis),
    maxReconnects: 1,
  });
}

function consumeTaskSource({
  source,
  task,
  onCardReady,
  onFailed,
}: {
  source: UiEventSource;
  task: DiscoverTask;
  onCardReady: (task: DiscoverTask, cardId: string) => void;
  onFailed: (task: DiscoverTask) => void;
}): () => void {
  const iterator = source.events()[Symbol.asyncIterator]();
  let cancelled = false;
  let cardReadyHandled = false;

  async function consumeEvents(): Promise<void> {
    try {
      while (!cancelled) {
        const result = await iterator.next();
        if (result.done || cancelled) {
          break;
        }

        const event = result.value;
        if (event.type === "card:ready" && !cardReadyHandled) {
          cardReadyHandled = true;
          onCardReady(task, event.card.id);
          break;
        }

        if (event.type === "error" && !event.recoverable) {
          onFailed(task);
          break;
        }
      }
    } catch {
      if (!cancelled) {
        onFailed(task);
      }
    } finally {
      try {
        await iterator.return?.();
      } catch {
        // An already completed stream has nothing left to cancel.
      }
    }
  }

  void consumeEvents();

  return () => {
    cancelled = true;
    void iterator.return?.();
  };
}

export function SeedAuthoringPanel({
  taskStore = createSessionStorageDiscoverStore(),
}: {
  taskStore?: DiscoverTaskStore;
}) {
  const router = useRouter();
  const routerPush = router.push;
  const taskStoreRef = useRef(taskStore);
  const store = taskStoreRef.current;
  const [topic, setTopic] = useState("");
  const [market, setMarket] = useState("US");
  const [productType, setProductType] = useState("t-shirt");
  const [eventSource, setEventSource] = useState<UiEventSource>();
  const [activeTask, setActiveTask] = useState<DiscoverTask>();
  const [tasks, setTasks] = useState<DiscoverTask[]>([]);

  const completeTask = useCallback(
    (task: DiscoverTask, cardId: string): void => {
      const completedTask = {
        ...task,
        status: "done",
        cardId,
      } satisfies DiscoverTask;

      store.save(completedTask);
      setTasks(store.load());
      routerPush("/trends/" + cardId);
    },
    [routerPush, store],
  );

  const failTask = useCallback(
    (task: DiscoverTask): void => {
      const failedTask = {
        ...task,
        status: "failed",
      } satisfies DiscoverTask;

      store.save(failedTask);
      setTasks(store.load());
    },
    [store],
  );

  useEffect(() => {
    const restored = store.load();
    setTasks(restored);

    const cancelConsumers = restored
      .filter((task) => task.status === "in-progress")
      .map((task) =>
        consumeTaskSource({
          source: createTaskEventSource(task),
          task,
          onCardReady: completeTask,
          onFailed: failTask,
        }),
      );

    return () => {
      for (const cancel of cancelConsumers) {
        cancel();
      }
    };
  }, [completeTask, failTask, store]);

  useEffect(() => {
    if (!eventSource || !activeTask) {
      return;
    }

    return consumeTaskSource({
      source: eventSource,
      task: activeTask,
      onCardReady(task, cardId) {
        completeTask(task, cardId);
        setEventSource(undefined);
        setActiveTask(undefined);
      },
      onFailed(task) {
        failTask(task);
        setEventSource(undefined);
        setActiveTask(undefined);
      },
    });
  }, [activeTask, completeTask, eventSource, failTask]);

  function submitSeed(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    const trimmedTopic = topic.trim();
    if (trimmedTopic.length === 0) {
      return;
    }

    const runId = crypto.randomUUID();
    const task = {
      id: runId,
      runId,
      seed: trimmedTopic,
      market,
      productType,
      status: "in-progress",
      startedAt: new Date().toISOString(),
    } satisfies DiscoverTask;

    store.save(task);
    setTasks(store.load());
    setActiveTask(task);
    setEventSource(createTaskEventSource(task));
  }

  const recentTasks = [...tasks].sort((left, right) =>
    right.startedAt.localeCompare(left.startedAt),
  );

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

      {eventSource ? (
        <p className="text-sm font-medium text-indigo-700" role="status">
          Creating your Trend Card…
        </p>
      ) : null}

      <Panel aria-label="Task history" className="p-6">
        <h3 className="text-lg font-semibold text-slate-950">Task history</h3>
        {recentTasks.length === 0 ? (
          <p className="mt-3 text-sm text-slate-500">No authored cards yet.</p>
        ) : (
          <div className="mt-4 space-y-3">
            {recentTasks.map((task) => (
              <div
                className="rounded-xl border border-slate-200 px-4 py-3"
                key={task.id}
              >
                {task.status === "done" && task.cardId ? (
                  <a
                    className="font-medium text-indigo-700 hover:text-indigo-900"
                    href={"/trends/" + task.cardId}
                  >
                    {task.seed} · {task.market} · {task.productType}
                  </a>
                ) : task.status === "failed" ? (
                  <p className="text-sm font-medium text-red-700" role="alert">
                    Failed to create {task.seed} · {task.market} ·{" "}
                    {task.productType}
                  </p>
                ) : (
                  <p
                    className="text-sm font-medium text-indigo-700"
                    role="status"
                  >
                    Creating your Trend Card… {task.seed} · {task.market} ·{" "}
                    {task.productType}
                  </p>
                )}
              </div>
            ))}
          </div>
        )}
      </Panel>
    </div>
  );
}
