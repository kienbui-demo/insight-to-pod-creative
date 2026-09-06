import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { RETRO_HALLOWEEN_CATS_CARD } from "../../../insights/__tests__/fixtures";
import { TrendCardDetail } from "../trend-card-detail";

describe("TrendCardDetail", () => {
  it("renders a visible bar per trend-series point (chart not collapsed)", () => {
    render(<TrendCardDetail card={RETRO_HALLOWEEN_CATS_CARD} />);

    const trendSeries = screen.getByLabelText("Trend series");
    const columns = Array.from(trendSeries.children);
    const bars = Array.from(
      trendSeries.querySelectorAll<HTMLElement>(
        ":scope > div > [style*='height']",
      ),
    );

    expect(bars).toHaveLength(RETRO_HALLOWEEN_CATS_CARD.trendSeries.length);
    expect(columns).toHaveLength(RETRO_HALLOWEEN_CATS_CARD.trendSeries.length);

    for (const bar of bars) {
      expect(bar.style.height).not.toBe("");
      expect(Number.parseFloat(bar.style.height)).toBeGreaterThan(0);
    }

    const maxPointIndex = RETRO_HALLOWEEN_CATS_CARD.trendSeries.findIndex(
      (point) =>
        point.v ===
        Math.max(
          ...RETRO_HALLOWEEN_CATS_CARD.trendSeries.map(({ v }) => v),
        ),
    );
    expect(bars[maxPointIndex]?.style.height).toBe("100%");
    expect(Number.parseFloat(bars[0]?.style.height ?? "0")).toBeLessThan(100);

    for (const column of columns) {
      expect(column).toHaveClass("h-full");
    }
  });

  it("renders the seller insight dashboard and opportunity report", () => {
    render(<TrendCardDetail card={RETRO_HALLOWEEN_CATS_CARD} />);

    expect(
      screen.getByRole("heading", { name: "Seller insight dashboard" }),
    ).toBeInTheDocument();

    expect(
      screen.getByRole("heading", { name: "Demand & momentum" }),
    ).toBeInTheDocument();
    expect(
      screen.getAllByRole("heading", { name: "Money & competition" }),
    ).toHaveLength(2);
    expect(
      screen.getByRole("heading", { name: "Confidence" }),
    ).toBeInTheDocument();

    expect(
      screen.getByRole("heading", { name: "Verdict / TL;DR" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Why it is rising" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Whitespace / differentiation" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Recommended action", level: 3 }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Confidence & caveats" }),
    ).toBeInTheDocument();

    expect(screen.getByText("Act now")).toBeInTheDocument();
  });
});
