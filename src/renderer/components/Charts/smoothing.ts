export interface SmoothingPoint {
  x: number;
  y: number;
}

/**
 * Exponential moving average with debias correction.
 * Mirrors the smoothing used by TensorBoard / Weights & Biases.
 *
 * weight = 0    -> no smoothing (returns y unchanged)
 * weight -> 1   -> heavy smoothing
 *
 * Operates on the y values in order; x values are passed through.
 */
export function emaSmooth(
  points: SmoothingPoint[],
  weight: number,
): SmoothingPoint[] {
  if (weight <= 0) return points.map((p) => ({ ...p }));
  const w = Math.min(weight, 0.999);

  const out: SmoothingPoint[] = [];
  let last = 0;
  let debiasWeight = 0;
  for (let i = 0; i < points.length; i += 1) {
    const { x, y } = points[i];
    if (!Number.isFinite(y)) {
      out.push({ x, y });
      continue;
    }
    last = last * w + (1 - w) * y;
    debiasWeight = debiasWeight * w + (1 - w);
    const smoothed = debiasWeight > 0 ? last / debiasWeight : y;
    out.push({ x, y: smoothed });
  }
  return out;
}
