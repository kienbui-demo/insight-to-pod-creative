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

export function competitors(
  value: unknown,
): { title: string; price?: number }[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((candidate) => {
    if (!isObject(candidate) || typeof candidate.title !== "string") {
      return [];
    }

    const competitor: { title: string; price?: number } = {
      title: candidate.title,
    };
    const price = finiteNumber(candidate.price);

    if (price !== undefined) {
      competitor.price = price;
    }

    return [competitor];
  });
}
