import { afterEach, describe, expect, it, vi } from "vitest";

import type {
  DistributionMetricObservation,
  MetricSink,
} from "../../../packages/contracts";
import {
  ConsoleLogMetricSink,
  writeStructuredLog,
} from "../console-log-sink";

const TS = "2026-09-09T12:34:56.789Z";
const OBSERVATION = {
  name: "ptv_infra_operation_duration_ms",
  kind: "distribution",
  value: 42,
  labels: {
    component: "modelark",
    operation: "send",
    outcome: "error",
  },
  observedAt: "2026-09-09T12:34:55.000Z",
  observationId: "operation-1",
} satisfies DistributionMetricObservation;

afterEach(() => {
  vi.restoreAllMocks();
});

describe("ConsoleLogMetricSink", () => {
  it("forwards every distinct observation to the inner sink unchanged", () => {
    const record = vi.fn<MetricSink["record"]>();
    vi.spyOn(console, "log").mockImplementation(() => undefined);
    const sink = new ConsoleLogMetricSink({ record }, () => TS);

    sink.record(OBSERVATION);

    expect(record).toHaveBeenCalledOnce();
    expect(record).toHaveBeenCalledWith(OBSERVATION);
    expect(record.mock.calls[0]?.[0]).toBe(OBSERVATION);
  });

  it("writes exactly one JSON line with the injected timestamp and metric metadata", () => {
    const consoleLog = vi
      .spyOn(console, "log")
      .mockImplementation(() => undefined);
    const sink = new ConsoleLogMetricSink({ record: vi.fn() }, () => TS);

    sink.record(OBSERVATION);

    expect(consoleLog).toHaveBeenCalledOnce();
    expect(consoleLog.mock.calls[0]).toHaveLength(1);
    expect(JSON.parse(String(consoleLog.mock.calls[0]?.[0]))).toEqual({
      ts: TS,
      metric: "ptv_infra_operation_duration_ms",
      kind: "distribution",
      value: 42,
      labels: {
        component: "modelark",
        operation: "send",
        outcome: "error",
      },
      observationId: "operation-1",
      outcome: "error",
      durationMs: 42,
    });
  });

  it("deduplicates repeated observation ids before forwarding or logging", () => {
    const record = vi.fn<MetricSink["record"]>();
    const consoleLog = vi
      .spyOn(console, "log")
      .mockImplementation(() => undefined);
    const sink = new ConsoleLogMetricSink({ record }, () => TS);

    sink.record(OBSERVATION);
    sink.record({ ...OBSERVATION });

    expect(record).toHaveBeenCalledOnce();
    expect(consoleLog).toHaveBeenCalledOnce();
  });

  it("isolates an inner sink failure and still attempts the console output", () => {
    const consoleLog = vi
      .spyOn(console, "log")
      .mockImplementation(() => undefined);
    const sink = new ConsoleLogMetricSink(
      {
        record() {
          throw new Error("monitoring backend unavailable");
        },
      },
      () => TS,
    );

    expect(() => sink.record(OBSERVATION)).not.toThrow();
    expect(consoleLog).toHaveBeenCalledOnce();
  });

  it("isolates a console failure and still forwards to the inner sink", () => {
    const record = vi.fn<MetricSink["record"]>();
    vi.spyOn(console, "log").mockImplementation(() => {
      throw new Error("stdout unavailable");
    });
    const sink = new ConsoleLogMetricSink({ record }, () => TS);

    expect(() => sink.record(OBSERVATION)).not.toThrow();
    expect(record).toHaveBeenCalledOnce();
    expect(record).toHaveBeenCalledWith(OBSERVATION);
  });
});

describe("writeStructuredLog", () => {
  it("writes one timestamped JSON line without exposing unprovided secrets", () => {
    const consoleLog = vi
      .spyOn(console, "log")
      .mockImplementation(() => undefined);

    writeStructuredLog(
      {
        step: "live_request",
        runId: "run-1",
        outcome: "error",
        reason: "ModelArk request failed with status 503",
      },
      () => TS,
    );

    expect(consoleLog).toHaveBeenCalledOnce();
    const line = String(consoleLog.mock.calls[0]?.[0]);
    expect(JSON.parse(line)).toEqual({
      ts: TS,
      step: "live_request",
      runId: "run-1",
      outcome: "error",
      reason: "ModelArk request failed with status 503",
    });
    expect(line).not.toContain("apiKey");
    expect(line).not.toContain("authorization");
  });
});
