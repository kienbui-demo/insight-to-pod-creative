import { describe, expect, it } from "vitest";

import { extractAnswerImageUrls } from "./answer-images";

describe("extractAnswerImageUrls", () => {
  it("extracts a markdown image URL", () => {
    expect(
      extractAnswerImageUrls(
        "See ![preview](https://tos.example/a.png) now",
      ),
    ).toEqual(["https://tos.example/a.png"]);
  });

  it("extracts a markdown link whose target is an image", () => {
    expect(
      extractAnswerImageUrls(
        "[Open image](https://tos.example/b.jpg)",
      ),
    ).toEqual(["https://tos.example/b.jpg"]);
  });

  it("ignores non-image links", () => {
    expect(
      extractAnswerImageUrls("[docs](https://tos.example/page)"),
    ).toEqual([]);
  });

  it("de-duplicates repeated URLs", () => {
    expect(
      extractAnswerImageUrls(
        "https://tos.example/c.webp then https://tos.example/c.webp",
      ),
    ).toEqual(["https://tos.example/c.webp"]);
  });

  it("returns an empty array for undefined and plain text", () => {
    expect(extractAnswerImageUrls(undefined)).toEqual([]);
    expect(extractAnswerImageUrls("No image URL here")).toEqual([]);
  });
});
