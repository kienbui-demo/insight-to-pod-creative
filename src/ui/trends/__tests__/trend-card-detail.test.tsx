import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { RETRO_HALLOWEEN_CATS_CARD } from "../../../insights/__tests__/fixtures";
import { TrendCardDetail } from "../trend-card-detail";

describe("TrendCardDetail", () => {
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
