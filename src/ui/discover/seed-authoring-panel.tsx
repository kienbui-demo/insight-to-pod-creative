"use client";

import { useRouter } from "next/navigation";
import {
  type FormEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";

import type { UiEvent } from "../../../packages/contracts";
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
const INITIAL_PROGRESS = "Creating your Trend Card…";
const NO_CARD_FAILURE_MESSAGE =
  "No Trend Card was produced — the assistant answered in chat.";
const TIMEOUT_FAILURE_MESSAGE = "Trend Card creation timed out.";
const TASK_WATCHDOG_TIMEOUT_MS = 120_000;

function sourceLabel(source: string): string {
  return source
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function progressLabel(event: UiEvent): string | undefined {
  switch (event.type) {
    case "scanning":
      return `Scanning ${sourceLabel(event.source)}…`;
    case "synthesizing":
      return "Synthesizing…";
    case "image:ready":
      return "Generating design…";
    case "answer":
      return "Finalizing Trend Card…";
    case "card:ready":
    case "error":
    case "done":
      return undefined;
  }
}

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
  onEnded,
  onTimedOut,
  onProgress,
}: {
  source: UiEventSource;
  task: DiscoverTask;
  onCardReady: (task: DiscoverTask, cardId: string) => void;
  onFailed: (task: DiscoverTask) => void;
  onEnded: (task: DiscoverTask) => void;
  onTimedOut: (task: DiscoverTask) => void;
  onProgress: (task: DiscoverTask, label: string) => void;
}): () => void {
  const iterator = source.events()[Symbol.asyncIterator]();
  let cancelled = false;
  let terminalHandled = false;
  let iteratorClosed = false;
  let watchdog: ReturnType<typeof setTimeout> | undefined;

  function clearWatchdog(): void {
    if (watchdog !== undefined) {
      clearTimeout(watchdog);
      watchdog = undefined;
    }
  }

  async function closeIterator(): Promise<void> {
    if (iteratorClosed) {
      return;
    }
    iteratorClosed = true;

    try {
      await iterator.return?.();
    } catch {
      // An already completed stream has nothing left to cancel.
    }
  }

  function handleTerminal(callback: () => void): boolean {
    if (cancelled || terminalHandled) {
      return false;
    }

    terminalHandled = true;
    clearWatchdog();
    callback();
    return true;
  }

  watchdog = setTimeout(() => {
    if (handleTerminal(() => onTimedOut(task))) {
      void closeIterator();
    }
  }, TASK_WATCHDOG_TIMEOUT_MS);

  async function consumeEvents(): Promise<void> {
    try {
      while (!cancelled && !terminalHandled) {
        const result = await iterator.next();
        if (cancelled || terminalHandled) {
          break;
        }
        if (result.done) {
          handleTerminal(() => onEnded(task));
          break;
        }

        const event = result.value;
        const label = progressLabel(event);
        if (label !== undefined) {
          onProgress(task, label);
        }
        if (event.type === "card:ready") {
          handleTerminal(() => onCardReady(task, event.card.id));
          break;
        }

        if (event.type === "error" && !event.recoverable) {
          handleTerminal(() => onFailed(task));
          break;
        }

        if (event.type === "done") {
          handleTerminal(() => onEnded(task));
          break;
        }
      }
    } catch {
      handleTerminal(() => onFailed(task));
    } finally {
      clearWatchdog();
      await closeIterator();
    }
  }

  void consumeEvents();

  return () => {
    cancelled = true;
    clearWatchdog();
    void closeIterator();
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
  const [taskProgress, setTaskProgress] = useState<Record<string, string>>({});
  const [taskFailureMessages, setTaskFailureMessages] = useState<
    Record<string, string>
  >({});

  const updateTaskProgress = useCallback(
    (task: DiscoverTask, label: string): void => {
      setTaskProgress((current) => ({ ...current, [task.id]: label }));
    },
    [],
  );

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
    (task: DiscoverTask, message?: string): void => {
      const failedTask = {
        ...task,
        status: "failed",
      } satisfies DiscoverTask;

      store.save(failedTask);
      setTasks(store.load());
      if (message !== undefined) {
        setTaskFailureMessages((current) => ({
          ...current,
          [task.id]: message,
        }));
      }
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
          onEnded(task) {
            failTask(task, NO_CARD_FAILURE_MESSAGE);
          },
          onTimedOut(task) {
            failTask(task, TIMEOUT_FAILURE_MESSAGE);
          },
          onProgress: updateTaskProgress,
        }),
      );

    return () => {
      for (const cancel of cancelConsumers) {
        cancel();
      }
    };
  }, [completeTask, failTask, store, updateTaskProgress]);

  useEffect(() => {
    if (!eventSource || !activeTask) {
      return;
    }

    function clearActiveTask(): void {
      setEventSource(undefined);
      setActiveTask(undefined);
    }

    return consumeTaskSource({
      source: eventSource,
      task: activeTask,
      onCardReady(task, cardId) {
        completeTask(task, cardId);
        clearActiveTask();
      },
      onFailed(task) {
        failTask(task);
        clearActiveTask();
      },
      onEnded(task) {
        failTask(task, NO_CARD_FAILURE_MESSAGE);
        clearActiveTask();
      },
      onTimedOut(task) {
        failTask(task, TIMEOUT_FAILURE_MESSAGE);
        clearActiveTask();
      },
      onProgress: updateTaskProgress,
    });
  }, [
    activeTask,
    completeTask,
    eventSource,
    failTask,
    updateTaskProgress,
  ]);

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
          {activeTask === undefined
            ? INITIAL_PROGRESS
            : (taskProgress[activeTask.id] ?? INITIAL_PROGRESS)}
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
                    {taskFailureMessages[task.id] ?? (
                      <>
                        Failed to create {task.seed} · {task.market} ·{" "}
                        {task.productType}
                      </>
                    )}
                  </p>
                ) : (
                  <p
                    className="text-sm font-medium text-indigo-700"
                    role="status"
                  >
                    {taskProgress[task.id] ?? INITIAL_PROGRESS} {task.seed} ·{" "}
                    {task.market} · {task.productType}
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
