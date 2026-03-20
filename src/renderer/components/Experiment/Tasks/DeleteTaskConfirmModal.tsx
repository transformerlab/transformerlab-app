import * as React from 'react';
import Modal from '@mui/joy/Modal';
import ModalDialog from '@mui/joy/ModalDialog';
import DialogTitle from '@mui/joy/DialogTitle';
import DialogContent from '@mui/joy/DialogContent';
import DialogActions from '@mui/joy/DialogActions';
import Button from '@mui/joy/Button';
import Typography from '@mui/joy/Typography';
import CircularProgress from '@mui/joy/CircularProgress';

export type DeleteTaskConfirmModalProps = {
  open: boolean;
  onClose: () => void;
  taskId: string | null;
  taskName?: string | null;
  onConfirm: (taskId: string) => Promise<boolean>;
};

export default function DeleteTaskConfirmModal({
  open,
  onClose,
  taskId,
  taskName,
  onConfirm,
}: DeleteTaskConfirmModalProps) {
  const [isDeleting, setIsDeleting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const handleClose = React.useCallback(() => {
    if (isDeleting) return;
    setError(null);
    onClose();
  }, [isDeleting, onClose]);

  const handleConfirm = React.useCallback(async () => {
    if (!taskId || isDeleting) return;
    setIsDeleting(true);
    setError(null);
    try {
      const success = await onConfirm(taskId);
      if (success) {
        setError(null);
        onClose();
      } else {
        setError('Failed to delete template. Please try again.');
      }
    } catch (err) {
      console.error('Error deleting template:', err);
      setError('Failed to delete template. Please try again.');
    } finally {
      setIsDeleting(false);
    }
  }, [taskId, isDeleting, onConfirm, handleClose]);

  const displayName = taskName || (taskId ? `Task ${taskId}` : 'this template');

  return (
    <Modal
      open={open}
      onClose={handleClose}
      sx={{ visibility: open ? 'visible' : 'hidden' }}
    >
      <ModalDialog
        variant="outlined"
        role="alertdialog"
        aria-labelledby="delete-task-title"
        aria-describedby="delete-task-description"
        sx={{ minWidth: 360 }}
      >
        <DialogTitle id="delete-task-title">Delete template?</DialogTitle>
        <DialogContent id="delete-task-description">
          <Typography>
            Are you sure you want to delete {displayName}? This action cannot be
            undone.
          </Typography>
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
            disabled={isDeleting}
          >
            Cancel
          </Button>
          <Button
            variant="solid"
            color="danger"
            onClick={handleConfirm}
            disabled={isDeleting}
            startDecorator={
              isDeleting ? (
                <CircularProgress size="sm" color="danger" />
              ) : undefined
            }
          >
            {isDeleting ? 'Deleting…' : 'Delete'}
          </Button>
        </DialogActions>
      </ModalDialog>
    </Modal>
  );
}
