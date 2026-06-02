// ---------------------------------------------------------------------------
// Model name history helpers (localStorage-backed)
//
// Kept separate from ModelNameInput.tsx so that the component file only
// exports a component (required for React Fast Refresh).
// ---------------------------------------------------------------------------

const MAX_HISTORY_SIZE = 10;
const STORAGE_KEY_PREFIX = 'tlab:modelHistory:';

/** Derive the localStorage key for a given interactive_type. */
export function getModelHistoryKey(
  taskTypeOrId: string | undefined | null,
): string {
  if (!taskTypeOrId) return `${STORAGE_KEY_PREFIX}default`;
  return `${STORAGE_KEY_PREFIX}${taskTypeOrId}`;
}

/** Read the saved history array for a given storage key. */
export function readModelHistory(storageKey: string): string[] {
  try {
    const raw = window.localStorage.getItem(storageKey);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed))
      return parsed.filter((v) => typeof v === 'string');
  } catch {
    // ignore corrupted data
  }
  return [];
}

/**
 * Persist a model name into the history for the given storage key.
 * - Deduplicates (moves existing entry to the front).
 * - Caps the list at MAX_HISTORY_SIZE.
 */
export function saveModelToHistory(
  storageKey: string,
  modelName: string,
): void {
  const trimmed = modelName.trim();
  if (!trimmed) return;
  try {
    const current = readModelHistory(storageKey);
    const deduplicated = [trimmed, ...current.filter((v) => v !== trimmed)];
    const capped = deduplicated.slice(0, MAX_HISTORY_SIZE);
    window.localStorage.setItem(storageKey, JSON.stringify(capped));
  } catch {
    // Ignore storage errors (e.g. private browsing quota)
  }
}

/** Remove a single entry from the stored history. */
export function removeModelFromHistory(
  storageKey: string,
  modelName: string,
): void {
  try {
    const current = readModelHistory(storageKey);
    const updated = current.filter((v) => v !== modelName);
    window.localStorage.setItem(storageKey, JSON.stringify(updated));
  } catch {
    // ignore
  }
}
