export function isObject(
  value: unknown,
): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function isContext(
  value: unknown,
): value is Record<string, unknown> & {
  market: string;
  seed: string;
  capturedAt: string;
} {
  return (
    isObject(value) &&
    typeof value.market === "string" &&
    typeof value.seed === "string" &&
    typeof value.capturedAt === "string"
  );
}

export function finiteNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value)
    ? value
    : undefined;
}

export function normalizedValue(value: unknown): number | undefined {
  const number = finiteNumber(value);
  return number !== undefined && number >= 0 && number <= 1
    ? number
    : undefined;
}

export function imageUrls(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((image) =>
    isObject(image) && typeof image.url === "string" && image.url.length > 0
      ? [image.url]
      : [],
  );
}
