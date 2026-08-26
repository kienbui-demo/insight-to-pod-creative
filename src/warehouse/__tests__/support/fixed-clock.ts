import type { Clock } from "../../types";

export const FIXED_NOW = "2026-08-27T03:04:05.000Z";

export class FixedClock implements Clock {
  constructor(private readonly value = FIXED_NOW) {}

  nowIso(): string {
    return this.value;
  }
}
