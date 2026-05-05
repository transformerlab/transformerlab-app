import {
  Button,
  Divider,
  Input,
  Modal,
  ModalClose,
  ModalDialog,
  Sheet,
  Typography,
} from '@mui/joy';
import { useState } from 'react';
import * as chatAPI from 'renderer/lib/transformerlab-api-sdk';

interface RenameExperimentModalProps {
  open: boolean;
  experimentId: string;
  currentName: string;
  onClose: () => void;
  onRenamed: (newName: string) => void;
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message) {
    return error.message;
  }
  return 'Failed to rename experiment';
}

export default function RenameExperimentModal({
  open,
  experimentId,
  currentName,
  onClose,
  onRenamed,
}: RenameExperimentModalProps) {
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const newName = (formData.get('name') as string)?.trim();
    if (!newName || newName === currentName) {
      onClose();
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const res = await chatAPI.authenticatedFetch(
        chatAPI.Endpoints.Experiment.Rename(experimentId),
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: newName }),
        },
      );
      if (!res.ok) {
        const text = await res.text();
        throw new Error(text || 'Rename failed');
      }
      const updated = await res.json();
      onRenamed(updated.name ?? newName);
      onClose();
    } catch (err: unknown) {
      setError(getErrorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose}>
      <ModalDialog>
        <ModalClose />
        <Typography level="title-lg">Rename Experiment</Typography>
        <Divider sx={{ my: 1 }} />
        {error && (
          <Typography color="danger" level="body-sm" sx={{ mb: 1 }}>
            {error}
          </Typography>
        )}
        <Sheet sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <form
            onSubmit={handleSubmit}
            style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}
          >
            <Input
              name="name"
              defaultValue={currentName}
              autoFocus
              required
              placeholder="Experiment name"
            />
            <Button type="submit" loading={saving}>
              Rename
            </Button>
          </form>
        </Sheet>
      </ModalDialog>
    </Modal>
  );
}
