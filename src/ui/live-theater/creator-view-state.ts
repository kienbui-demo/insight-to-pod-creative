import type {
  CrawlSource,
  TrendCard,
  UiEvent,
} from "../../../packages/contracts";

export type CreatorViewState = {
  streamStatus: "idle" | "active" | "done" | "failed";
  stage: "scanning" | "synthesizing" | "image-ready" | "card-ready" | null;
  scannedSources: CrawlSource[];
  synthesisNote?: string;
  imageUrls: string[];
  card?: TrendCard;
  warnings: string[];
  fatalError?: string;
  seenEventIds: string[];
};

export function createInitialCreatorViewState(): CreatorViewState {
  return {
    streamStatus: "idle",
    stage: null,
    scannedSources: [],
    imageUrls: [],
    warnings: [],
    seenEventIds: [],
  };
}

export function reduceCreatorViewState(
  state: CreatorViewState,
  event: UiEvent,
): CreatorViewState {
  if (
    state.streamStatus === "done" ||
    state.streamStatus === "failed" ||
    state.seenEventIds.includes(event.id)
  ) {
    return state;
  }

  const seenEventIds = [...state.seenEventIds, event.id];

  switch (event.type) {
    case "scanning":
      return {
        ...state,
        streamStatus: "active",
        stage: "scanning",
        scannedSources: state.scannedSources.includes(event.source)
          ? state.scannedSources
          : [...state.scannedSources, event.source],
        seenEventIds,
      };
    case "synthesizing":
      return {
        ...state,
        streamStatus: "active",
        stage: "synthesizing",
        synthesisNote: event.note,
        seenEventIds,
      };
    case "image:ready":
      return {
        ...state,
        streamStatus: "active",
        stage: "image-ready",
        imageUrls: [...state.imageUrls, event.url],
        seenEventIds,
      };
    case "card:ready":
      return {
        ...state,
        streamStatus: "active",
        stage: "card-ready",
        card: event.card,
        seenEventIds,
      };
    case "error":
      if (event.recoverable) {
        return {
          ...state,
          streamStatus: "active",
          warnings: [...state.warnings, event.message],
          seenEventIds,
        };
      }

      return {
        ...state,
        streamStatus: "failed",
        fatalError: event.message,
        seenEventIds,
      };
    case "done":
      return {
        ...state,
        streamStatus: "done",
        seenEventIds,
      };
  }
}
