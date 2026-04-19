import { describe, it, expect } from "vitest";
import { computeDelta } from "./computeDelta";

describe("computeDelta", () => {
  it("identical values are similar", () => {
    const d = computeDelta(10, 10);
    expect(d.kind).toBe("similar");
    expect(d.absolute).toBe(0);
    expect(d.ratio).toBe(1);
    expect(d.diverges).toBe(false);
  });

  it("1.3x flags similar under default threshold 1.5", () => {
    const d = computeDelta(100, 130);
    expect(d.kind).toBe("similar");
    expect(d.ratio).toBeCloseTo(1.3);
  });

  it("2x flags worse but not diverges (below 3x)", () => {
    const d = computeDelta(100, 200);
    expect(d.kind).toBe("worse");
    expect(d.diverges).toBe(false);
  });

  it("10x on a higher-is-worse metric diverges", () => {
    const d = computeDelta(100, 1000);
    expect(d.kind).toBe("worse");
    expect(d.diverges).toBe(true);
    expect(d.ratio).toBe(10);
  });

  it("10x drop on higher-is-worse metric is better + diverges", () => {
    const d = computeDelta(1000, 100);
    expect(d.kind).toBe("better");
    expect(d.diverges).toBe(false);
  });

  it("higherIsWorse:false inverts the verdict", () => {
    const d = computeDelta(100, 1000, { higherIsWorse: false });
    expect(d.kind).toBe("better");
    expect(d.diverges).toBe(false);
  });

  it("undefined on either side yields not_present", () => {
    expect(computeDelta(undefined, 100).kind).toBe("not_present");
    expect(computeDelta(100, undefined).kind).toBe("not_present");
    expect(computeDelta(undefined, undefined).kind).toBe("not_present");
  });

  it("both zero is similar with null ratio", () => {
    const d = computeDelta(0, 0);
    expect(d.kind).toBe("similar");
    expect(d.ratio).toBeNull();
  });

  it("zero baseline with non-zero b diverges with null ratio", () => {
    const d = computeDelta(0, 5);
    expect(d.kind).toBe("worse");
    expect(d.diverges).toBe(true);
    expect(d.ratio).toBeNull();
    expect(d.absolute).toBe(5);
  });

  it("custom similarWithin tightens the band", () => {
    const d = computeDelta(100, 130, { similarWithin: 1.1 });
    expect(d.kind).toBe("worse");
  });

  it("custom divergesBeyond loosens the divergence bar", () => {
    const d = computeDelta(100, 500, { divergesBeyond: 10 });
    expect(d.kind).toBe("worse");
    expect(d.diverges).toBe(false);
  });
});
