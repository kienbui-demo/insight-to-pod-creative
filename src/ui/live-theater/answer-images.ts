const IMAGE_EXT = /\.(png|jpe?g|webp|gif|avif)(\?[^\s)]*)?$/i;

export function extractAnswerImageUrls(
  text: string | undefined,
): string[] {
  if (!text) {
    return [];
  }

  const tokens = text.match(/https?:\/\/[^\s)]+/g) ?? [];
  const seen = new Set<string>();
  const result: string[] = [];

  for (const token of tokens) {
    const url = token.replace(/[)\].,]+$/, "");

    if (IMAGE_EXT.test(url) && !seen.has(url)) {
      seen.add(url);
      result.push(url);
    }
  }

  return result;
}
