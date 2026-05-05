import * as React from 'react';
import Modal from '@mui/joy/Modal';
import ModalDialog from '@mui/joy/ModalDialog';
import ModalClose from '@mui/joy/ModalClose';
import DialogTitle from '@mui/joy/DialogTitle';
import DialogContent from '@mui/joy/DialogContent';
import DialogActions from '@mui/joy/DialogActions';
import Button from '@mui/joy/Button';
import Textarea from '@mui/joy/Textarea';
import Typography from '@mui/joy/Typography';
import CircularProgress from '@mui/joy/CircularProgress';

export type JobNotesModalProps = {
  open: boolean;
  onClose: () => void;
  jobId: string | null;
  initialNotes: string;
  onSave: (jobId: string, notes: string) => Promise<void>;
};

export default function JobNotesModal({
  open,
  onClose,
  jobId,
  initialNotes,
  onSave,
}: JobNotesModalProps) {
  const [value, setValue] = React.useState(initialNotes);
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (open) {
      setValue(initialNotes);
      setError(null);
    }
  }, [open, initialNotes]);

  const handleClose = () => {
    if (saving) return;
    onClose();
  };

  const handleSave = async () => {
    if (!jobId || saving) return;
    setSaving(true);
    setError(null);
    try {
      await onSave(jobId, value);
      onClose();
    } catch (err) {
      console.error('Error saving notes:', err);
      setError('Failed to save notes. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal open={open} onClose={handleClose}>
      <ModalDialog
        variant="outlined"
        sx={{ minWidth: 480, maxWidth: 640, width: '90vw' }}
      >
        <ModalClose disabled={saving} />
        <DialogTitle>{initialNotes ? 'Edit Notes' : 'Add Notes'}</DialogTitle>
        <DialogContent>
          <Textarea
            value={value}
            onChange={(e) => setValue(e.target.value)}
            minRows={6}
            maxRows={16}
            placeholder="Write notes about this job…"
            disabled={saving}
            autoFocus
          />
          {error && (
            <Typography level="body-sm" color="danger" sx={{ mt: 1 }}>
              {error}
            </Typography>
          )}
        </DialogContent>
        <DialogActions>
          <Button
            variant="plain"
            color="neutral"
            onClick={handleClose}
            disabled={saving}
          >
            Cancel
          </Button>
          <Button
            variant="solid"
            onClick={handleSave}
            disabled={saving}
            startDecorator={saving ? <CircularProgress size="sm" /> : undefined}
          >
            {saving ? 'Saving…' : 'Save'}
          </Button>
        </DialogActions>
      </ModalDialog>
    </Modal>
  );
}
