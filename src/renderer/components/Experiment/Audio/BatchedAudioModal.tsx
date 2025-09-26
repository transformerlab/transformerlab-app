import * as React from 'react';
import {
  Modal,
  ModalDialog,
  ModalClose,
  DialogTitle,
  Divider,
  Stack,
  Button,
  Typography,
  FormControl,
} from '@mui/joy';

type BatchedAudioModalProps = {
  open: boolean;
  onClose: () => void;
  isLoading?: boolean;
  onSubmit: (prompts: string[]) => Promise<void> | void;
};

export default function BatchedAudioModal({
  open,
  onClose,
  isLoading = false,
  onSubmit,
}: BatchedAudioModalProps) {
  const [prompts, setPrompts] = React.useState<string[]>(['']);

  function updatePrompt(index: number, value: string) {
    const next = [...prompts];
    next[index] = value;
    setPrompts(next);
  }

  function addPrompt() {
    setPrompts((prev) => [...prev, '']);
  }

  function removePrompt(index: number) {
    setPrompts((prev) => prev.filter((_, i) => i !== index));
  }

  function resetPrompts() {
    setPrompts(['']);
  }

  async function handleSubmit() {
    const cleaned = prompts.map((p) => p.trim()).filter((p) => p.length > 0);
    if (cleaned.length === 0) return;
    await onSubmit(cleaned);
  }

  return (
    <Modal open={open} onClose={onClose}>
      <ModalDialog variant="outlined" sx={{ minWidth: 600, maxWidth: 900 }}>
        <ModalClose />
        <DialogTitle>Send Batched Prompts</DialogTitle>
        <Divider />
        <Stack spacing={2} sx={{ mt: 1 }}>
          <Typography level="body-sm" color="neutral">
            Add one or more prompts. Each prompt can be multi-line. A separate
            audio file will be generated for each prompt.
          </Typography>

          <Stack spacing={1} sx={{ maxHeight: 360, overflowY: 'auto' }}>
            {prompts.map((value, idx) => (
              <FormControl key={idx} sx={{ gap: 0.5 }}>
                <textarea
                  value={value}
                  onChange={(e) => updatePrompt(idx, e.target.value)}
                  placeholder={`Prompt ${idx + 1}`}
                  style={{
                    minHeight: '100px',
                    padding: '12px',
                    borderRadius: '8px',
                    fontSize: '14px',
                    lineHeight: '1.5',
                    overflowY: 'auto',
                    width: '100%',
                  }}
                />
                <Stack
                  direction="row"
                  spacing={1}
                  sx={{ alignSelf: 'flex-end' }}
                >
                  {prompts.length > 1 && (
                    <Button
                      size="sm"
                      variant="plain"
                      color="danger"
                      onClick={() => removePrompt(idx)}
                    >
                      Remove
                    </Button>
                  )}
                </Stack>
              </FormControl>
            ))}
          </Stack>

          <Stack direction="row" spacing={1}>
            <Button variant="outlined" onClick={addPrompt}>
              + Add Prompt
            </Button>
          </Stack>

          <Stack direction="row" spacing={1} justifyContent="flex-end">
            <Button variant="plain" onClick={onClose}>
              Cancel
            </Button>
            <Button variant="outlined" onClick={resetPrompts}>
              Reset
            </Button>
            <Button
              variant="solid"
              disabled={isLoading}
              loading={isLoading}
              onClick={handleSubmit}
            >
              Send Batch
            </Button>
          </Stack>
        </Stack>
      </ModalDialog>
    </Modal>
  );
}
