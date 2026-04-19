/** Visual verdict for a compared pair of numeric values. */
export type DeltaKind = "worse" | "better" | "similar" | "not_present";

export interface Delta {
  /** b − a. Negative when b decreased. Undefined when either side is missing. */
  absolute: number | null;
  /** b / a. Null when a is 0 or either side is missing. */
  ratio: number | null;
  kind: DeltaKind;
  /** True when the ratio crosses the divergence threshold on the worse axis. */
  diverges: boolean;
}

export interface ComputeDeltaOpts {
  /** Default true. Set false for metrics where larger = better. */
  higherIsWorse?: boolean;
  /** Ratios within [1 / similarWithin, similarWithin] read as "similar". Default 1.5. */
  similarWithin?: number;
  /** Ratios beyond this on the worse axis mark `diverges: true`. Default 3. */
  divergesBeyond?: number;
}

/**
 * Compare two numbers — typically run A vs run B — and return the absolute
 * diff, the ratio, and a coarse verdict useful for ▲/▼/~/"not present" UI.
 *
 * Missing sides: if either `a` or `b` is undefined, returns `kind:
 * "not_present"` with null ratio/absolute. If both are 0, returns "similar"
 * with ratio null.
 */
export function computeDelta(
  a: number | undefined,
  b: number | undefined,
  opts: ComputeDeltaOpts = {},
): Delta {
  const higherIsWorse = opts.higherIsWorse ?? true;
  const similarWithin = opts.similarWithin ?? 1.5;
  const divergesBeyond = opts.divergesBeyond ?? 3;

  if (a === undefined || b === undefined) {
    return {
      absolute: null,
      ratio: null,
      kind: "not_present",
      diverges: false,
    };
  }

  const absolute = b - a;

  if (a === 0 && b === 0) {
    return { absolute: 0, ratio: null, kind: "similar", diverges: false };
  }
  if (a === 0) {
    // Anything vs zero is divergent. Direction follows higherIsWorse.
    const kind: DeltaKind = higherIsWorse
      ? b > 0
        ? "worse"
        : "better"
      : b > 0
        ? "better"
        : "worse";
    return { absolute, ratio: null, kind, diverges: true };
  }

  const ratio = b / a;
  const similar = ratio >= 1 / similarWithin && ratio <= similarWithin;
  if (similar) {
    return { absolute, ratio, kind: "similar", diverges: false };
  }

  const bigger = ratio > 1;
  const worse = higherIsWorse ? bigger : !bigger;
  const kind: DeltaKind = worse ? "worse" : "better";

  const worseRatio = bigger ? ratio : 1 / ratio;
  const diverges = worse && worseRatio > divergesBeyond;

  return { absolute, ratio, kind, diverges };
}
