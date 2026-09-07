import { describe, expect, it } from "vitest";

import { buildWarehouseReader } from "../warehouse-reader";

describe("buildWarehouseReader", () => {
  it("returns null when DATABASE_URL is absent or empty", () => {
    expect(buildWarehouseReader({ NODE_ENV: "test" })).toBeNull();
    expect(
      buildWarehouseReader({ NODE_ENV: "test", DATABASE_URL: "" }),
    ).toBeNull();
  });

  it("returns warehouse read methods without opening a database connection", () => {
    const reader = buildWarehouseReader({
      NODE_ENV: "test",
      DATABASE_URL: "postgresql://user:pass@localhost:5432/test",
    });

    expect(reader).not.toBeNull();
    expect(typeof reader?.listRecent).toBe("function");
    expect(typeof reader?.findById).toBe("function");
  });
});
