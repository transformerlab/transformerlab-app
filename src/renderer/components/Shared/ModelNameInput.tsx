import * as React from 'react';
import {
  Autocomplete,
  AutocompleteOption,
  IconButton,
  Typography,
} from '@mui/joy';
import { XIcon } from 'lucide-react';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MAX_HISTORY_SIZE = 10;
const STORAGE_KEY_PREFIX = 'tlab:modelHistory:';

/**
 * Map interactive_type / gallery id values to a stable storage-key suffix.
 * Gallery entries without an interactive_type use their id directly.
 */
const TASK_TYPE_KEY_MAP: Record<string, string> = {
  vllm: 'vllm',
  ollama: 'ollama',
  ollama_gradio: 'ollama',
  mlx_gradio: 'mlx',
  mlx_audio_tts: 'mlx',
};

/** Derive the localStorage key for a given task type / gallery id. */
export function getModelHistoryKey(
  taskTypeOrId: string | undefined | null,
): string {
  if (!taskTypeOrId) return `${STORAGE_KEY_PREFIX}default`;
  const mapped = TASK_TYPE_KEY_MAP[taskTypeOrId];
  return `${STORAGE_KEY_PREFIX}${mapped ?? taskTypeOrId}`;
}

// ---------------------------------------------------------------------------
// localStorage helpers
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export interface ModelNameInputProps {
  /** Current value (controlled). */
  value: string;
  /** Called whenever the input value changes (free-form typing or selection). */
  onChange: (value: string) => void;
  /**
   * The interactive_type or gallery id used to scope the history.
   * e.g. 'vllm', 'ollama', 'mlx_gradio'. Pass `undefined` to use the
   * default (shared) bucket.
   */
  taskTypeOrId?: string | null;
  /** Placeholder text shown when the field is empty. */
  placeholder?: string;
  /** Whether the input is disabled. */
  disabled?: boolean;
  /** Whether the field is required. */
  required?: boolean;
}

/**
 * A freeSolo Joy UI Autocomplete that shows previously typed model names
 * as dropdown suggestions, scoped by task type.
 *
 * Call `saveModelToHistory(getModelHistoryKey(taskTypeOrId), value)` from
 * the parent's submit handler to persist the entered value.
 */
export default function ModelNameInput({
  value,
  onChange,
  taskTypeOrId,
  placeholder = 'e.g. meta-llama/Llama-3-8B',
  disabled = false,
  required = false,
}: ModelNameInputProps) {
  const storageKey = getModelHistoryKey(taskTypeOrId);

  // Re-read history whenever the modal opens (taskTypeOrId changes) or after
  // the user removes an entry.
  const [history, setHistory] = React.useState<string[]>(() =>
    readModelHistory(storageKey),
  );

  // Refresh the history list when the task type changes (e.g. user switched
  // template in the same modal session).
  React.useEffect(() => {
    setHistory(readModelHistory(storageKey));
  }, [storageKey]);

  const handleRemoveEntry = React.useCallback(
    (entry: string, e: React.MouseEvent) => {
      e.preventDefault();
      removeModelFromHistory(storageKey, entry);
      setHistory(readModelHistory(storageKey));
    },
    [storageKey],
  );

  return (
    <Autocomplete
      freeSolo
      // Provide the saved history as options
      options={history}
      // Control both the input value and the autocomplete value
      value={value || null}
      inputValue={value}
      // Only handle free-form typing via onInputChange
      onInputChange={(_event, newInputValue, reason) => {
        if (reason === 'input') {
          onChange(newInputValue ?? '');
        }
      }}
      // Handle clearing via the clear button (value becomes null)
      onChange={(_event, newValue) => {
        if (newValue === null) {
          onChange('');
        } else if (typeof newValue === 'string') {
          onChange(newValue);
        }
      }}
      placeholder={placeholder}
      disabled={disabled}
      required={required}
      // Render each option with an inline ✕ button to remove it from history
      renderOption={(props, option) => (
        <AutocompleteOption
          {...props}
          key={option}
          sx={{ display: 'flex', justifyContent: 'space-between', gap: 1 }}
        >
          <Typography
            level="body-sm"
            sx={{ flexGrow: 1, overflow: 'hidden', textOverflow: 'ellipsis' }}
          >
            {option}
          </Typography>
          <IconButton
            size="sm"
            variant="plain"
            color="neutral"
            aria-label={`Remove ${option} from history`}
            onMouseDown={(e) => {
              e.preventDefault();
              handleRemoveEntry(option, e as any);
            }}
            sx={{ flexShrink: 0, minWidth: 'unset', p: 0.25 }}
          >
            <XIcon size={12} />
          </IconButton>
        </AutocompleteOption>
      )}
      // Keep the same visual style as the existing Joy UI <Input> fields
      sx={{ width: '100%' }}
    />
  );
}
