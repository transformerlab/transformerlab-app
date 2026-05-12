import {
  Box,
  Button,
  Chip,
  IconButton,
  Input,
  Modal,
  ModalClose,
  ModalDialog,
  Stack,
  Typography,
} from '@mui/joy';
import { PencilIcon, XIcon } from 'lucide-react';
import { useState } from 'react';
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

  const id = experimentId || experimentName;

  async function callTagApi(url: string, tagList: string[]) {
    setBusy(true);
    setError(null);
    try {
      await fetcher(url, {
        method: 'POST',
        body: JSON.stringify({ tags: tagList }),
      });
      await onChanged();
    } catch (e: any) {
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
    await callTagApi(chatAPI.Endpoints.Experiment.TagsAdd(id), parsed);
    setDraft('');
  }

  async function handleRemove(tag: string) {
    await callTagApi(chatAPI.Endpoints.Experiment.TagsRemove(id), [tag]);
  }

  return (
    <>
      <IconButton
        size="sm"
        variant="plain"
        title="Edit tags"
        onClick={() => setOpen(true)}
      >
        <PencilIcon size={14} />
      </IconButton>
      <Modal open={open} onClose={() => setOpen(false)}>
        <ModalDialog sx={{ minWidth: 360 }}>
          <ModalClose />
          <Typography level="title-md">Edit tags — {experimentName}</Typography>
          <Stack spacing={1.5} sx={{ mt: 1 }}>
            <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
              {tags.length === 0 && (
                <Typography level="body-sm" color="neutral">
                  No tags yet.
                </Typography>
              )}
              {tags.map((t) => (
                <Chip
                  key={t}
                  size="sm"
                  variant="soft"
                  color="neutral"
                  endDecorator={
                    <IconButton
                      size="sm"
                      variant="plain"
                      onClick={() => handleRemove(t)}
                      disabled={busy}
                    >
                      <XIcon size={10} />
                    </IconButton>
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
