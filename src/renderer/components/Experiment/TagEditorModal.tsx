import {
  Box,
  Button,
  Chip,
  ChipDelete,
  IconButton,
  Input,
  Modal,
  ModalClose,
  ModalDialog,
  Stack,
  Tooltip,
  Typography,
} from '@mui/joy';
import { TagIcon } from 'lucide-react';
import { useEffect, useState } from 'react';
import * as chatAPI from 'renderer/lib/transformerlab-api-sdk';
import { fetcher } from 'renderer/lib/transformerlab-api-sdk';
import { parseTagInput } from './tagUtils';

interface TagEditorProps {
  experimentId: string;
  experimentName: string;
  tags: string[];
  onChanged: () => void | Promise<unknown>;
}

export default function TagEditor({
  experimentId,
  experimentName,
  tags,
  onChanged,
}: TagEditorProps) {
  const [draft, setDraft] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);
  const [localTags, setLocalTags] = useState<string[]>(tags);

  // Sync local state when parent data refreshes or modal reopens.
  useEffect(() => {
    setLocalTags(tags);
  }, [tags, open]);

  const id = experimentId || experimentName;

  async function callTagApi(
    url: string,
    tagList: string[],
    optimistic: string[],
    previous: string[],
  ) {
    setBusy(true);
    setError(null);
    setLocalTags(optimistic);
    try {
      await fetcher(url, {
        method: 'POST',
        body: JSON.stringify({ tags: tagList }),
      });
      // Fire-and-forget parent refresh so UI stays snappy.
      void onChanged();
    } catch (e: any) {
      setLocalTags(previous);
      const detail =
        e?.response && typeof e.response === 'object' && 'detail' in e.response
          ? String(e.response.detail)
          : e instanceof Error
            ? e.message
            : String(e);
      setError(detail);
    } finally {
      setBusy(false);
    }
  }

  async function handleAdd() {
    const parsed = parseTagInput(draft);
    if (parsed.length === 0) return;
    const previous = localTags;
    const merged = Array.from(new Set([...previous, ...parsed]));
    setDraft('');
    await callTagApi(
      chatAPI.Endpoints.Experiment.TagsAdd(id),
      parsed,
      merged,
      previous,
    );
  }

  async function handleRemove(tag: string) {
    const previous = localTags;
    const next = previous.filter((t) => t !== tag);
    await callTagApi(
      chatAPI.Endpoints.Experiment.TagsRemove(id),
      [tag],
      next,
      previous,
    );
  }

  return (
    <>
      <Tooltip title="Edit tags">
        <IconButton size="sm" variant="plain" onClick={() => setOpen(true)}>
          <TagIcon size={14} />
        </IconButton>
      </Tooltip>
      <Modal open={open} onClose={() => setOpen(false)}>
        <ModalDialog sx={{ minWidth: 360 }}>
          <ModalClose />
          <Typography level="title-md">Edit tags ({experimentName})</Typography>
          <Stack spacing={1.5} sx={{ mt: 1 }}>
            <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
              {localTags.length === 0 && (
                <Typography level="body-sm" color="neutral">
                  No tags yet.
                </Typography>
              )}
              {localTags.map((t) => (
                <Chip
                  key={t}
                  size="sm"
                  variant="soft"
                  color="neutral"
                  endDecorator={
                    <ChipDelete
                      onDelete={() => handleRemove(t)}
                      disabled={busy}
                    />
                  }
                >
                  {t}
                </Chip>
              ))}
            </Box>
            <Input
              size="sm"
              placeholder="Add tags (comma or Enter)"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  handleAdd();
                }
              }}
              disabled={busy}
              autoFocus
            />
            <Button
              size="sm"
              onClick={handleAdd}
              disabled={busy || draft.trim().length === 0}
            >
              Add
            </Button>
            {error && (
              <Typography level="body-xs" color="danger">
                {error}
              </Typography>
            )}
          </Stack>
        </ModalDialog>
      </Modal>
    </>
  );
}
