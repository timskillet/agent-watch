import { describe, it, expect, afterEach } from "vitest";
import { cleanup, render } from "@testing-library/react";
import { DeltaCell, DeltaSummary } from "./DeltaCell";
import type { Delta } from "../../lib/computeDelta";

afterEach(cleanup);

function delta(partial: Partial<Delta>): Delta {
  return {
    absolute: 0,
    ratio: 1,
    kind: "similar",
    diverges: false,
    ...partial,
  };
}

describe("DeltaCell", () => {
  it("renders — for missing values", () => {
    const { container } = render(
      <DeltaCell value={undefined} format="count" />,
    );
    expect(container.textContent).toBe("—");
  });

  it("formats duration values", () => {
    const { container } = render(<DeltaCell value={5400} format="duration" />);
    expect(container.textContent).toBe("5.4s");
  });

  it("formats cost values", () => {
    const { container } = render(<DeltaCell value={0.123} format="cost" />);
    expect(container.textContent).toBe("$0.12");
  });
});

describe("DeltaSummary", () => {
  it("shows ~ similar for similar kind", () => {
    const { container } = render(
      <DeltaSummary delta={delta({ kind: "similar" })} format="count" />,
    );
    expect(container.textContent).toContain("similar");
  });

  it("shows 'not present' for not_present kind", () => {
    const { container } = render(
      <DeltaSummary
        delta={delta({ kind: "not_present", ratio: null, absolute: null })}
        format="count"
      />,
    );
    expect(container.textContent).toBe("not present");
  });

  it("shows ▲ with ratio for worse kind", () => {
    const { container } = render(
      <DeltaSummary
        delta={delta({ kind: "worse", ratio: 2.5, absolute: 1500 })}
        format="count"
      />,
    );
    expect(container.textContent).toContain("▲");
    expect(container.textContent).toContain("2.5×");
  });

  it("shows ▼ with ratio for better kind", () => {
    const { container } = render(
      <DeltaSummary
        delta={delta({ kind: "better", ratio: 0.5, absolute: -500 })}
        format="count"
      />,
    );
    expect(container.textContent).toContain("▼");
  });

  it("adds DIVERGES badge when worse + diverges", () => {
    const { container } = render(
      <DeltaSummary
        delta={delta({
          kind: "worse",
          ratio: 10,
          absolute: 9000,
          diverges: true,
        })}
        format="count"
      />,
    );
    expect(container.textContent).toContain("DIVERGES");
  });

  it("falls back to absolute when ratio is null on worse kind", () => {
    const { container } = render(
      <DeltaSummary
        delta={delta({
          kind: "worse",
          ratio: null,
          absolute: 5,
          diverges: true,
        })}
        format="count"
      />,
    );
    // Absolute 5 → "5" in count format, plus DIVERGES.
    expect(container.textContent).toContain("5");
    expect(container.textContent).toContain("DIVERGES");
  });
});
