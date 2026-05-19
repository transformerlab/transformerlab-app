const DISCARD_KEY = 'discard';

function toFiniteNumber(value: unknown): number | null {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null;
  }
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return null;
    const parsed = Number.parseFloat(trimmed);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

export function normalizeJobScore(
  score: unknown,
): Record<string, number> | null {
  if (score === null || score === undefined) return null;

  if (typeof score === 'number' || typeof score === 'string') {
    const n = toFiniteNumber(score);
    return n === null ? null : { score: n };
  }

  if (typeof score === 'object' && !Array.isArray(score)) {
    const out: Record<string, number> = {};
    for (const [key, value] of Object.entries(
      score as Record<string, unknown>,
    )) {
      if (key.toLowerCase() === DISCARD_KEY) continue;
      const n = toFiniteNumber(value);
      if (n !== null) out[key] = n;
    }
    return Object.keys(out).length > 0 ? out : null;
  }

  return null;
}
