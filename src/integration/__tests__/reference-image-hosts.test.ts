import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

describe("reference image hosts", () => {
  it("uses real Wikimedia image hosts in the development trend-card seed", () => {
    const seedSql = readFileSync(
      join(process.cwd(), "packages/contracts/seed/dev-trend-cards.sql"),
      "utf8",
    );

    expect(seedSql).not.toContain("tos.example");
    expect(seedSql).toContain("commons.wikimedia.org");
  });

  it("allows Wikimedia image hosts in the Next.js image configuration", () => {
    const nextConfig = readFileSync(
      join(process.cwd(), "next.config.ts"),
      "utf8",
    );

    expect(nextConfig).toContain("commons.wikimedia.org");
    expect(nextConfig).toContain("upload.wikimedia.org");
  });
});
