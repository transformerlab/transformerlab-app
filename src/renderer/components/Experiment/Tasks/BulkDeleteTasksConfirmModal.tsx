import * as React from 'react';
import Modal from '@mui/joy/Modal';
import ModalDialog from '@mui/joy/ModalDialog';
import DialogTitle from '@mui/joy/DialogTitle';
import DialogContent from '@mui/joy/DialogContent';
import DialogActions from '@mui/joy/DialogActions';
import Button from '@mui/joy/Button';
import Typography from '@mui/joy/Typography';
import CircularProgress from '@mui/joy/CircularProgress';
import LinearProgress from '@mui/joy/LinearProgress';

export type BulkDeleteTasksConfirmModalProps = {
  open: boolean;
  onClose: () => void;
  taskIds: string[];
  onConfirm: (
    taskIds: string[],
  ) => Promise<{ succeeded: number; failed: number }>;
  onComplete?: (succeeded: number, failed: number) => void;
};

export default function BulkDeleteTasksConfirmModal({
  open,
  onClose,
  taskIds,
  onConfirm,
  onComplete,
}: BulkDeleteTasksConfirmModalProps) {
  const [isDeleting, setIsDeleting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!open) {
      setIsDeleting(false);
      setError(null);
    }
  }, [open]);

  const handleClose = React.useCallback(() => {
    if (isDeleting) return;
    onClose();
  }, [isDeleting, onClose]);

  const handleConfirm = React.useCallback(async () => {
    if (taskIds.length === 0 || isDeleting) return;
    setIsDeleting(true);
    setError(null);

    let succeeded = 0;
    let failed = taskIds.length;
    try {
      const result = await onConfirm(taskIds);
      succeeded = result.succeeded;
      failed = result.failed;
    } catch (err) {
      console.error('Bulk delete request failed:', err);
    }

    setIsDeleting(false);
    onComplete?.(succeeded, failed);
    if (failed === 0) {
      onClose();
    } else {
      setError(
        `${failed} of ${taskIds.length} task${
          taskIds.length === 1 ? '' : 's'
        } failed to delete. Please try again.`,
      );
    }
  }, [taskIds, isDeleting, onConfirm, onClose, onComplete]);

  const total = taskIds.length;

  return (
    <Modal
      open={open}
      onClose={handleClose}
      sx={{ visibility: open ? 'visible' : 'hidden' }}
    >
      <ModalDialog
        variant="outlined"
        role="alertdialog"
        aria-labelledby="bulk-delete-tasks-title"
        aria-describedby="bulk-delete-tasks-description"
        sx={{ minWidth: 380 }}
      >
        <DialogTitle id="bulk-delete-tasks-title">
          Delete {total} task{total === 1 ? '' : 's'}?
        </DialogTitle>
        <DialogContent id="bulk-delete-tasks-description">
          <Typography>
            Are you sure you want to delete {total} selected task
            {total === 1 ? '' : 's'}? This action cannot be undone.
          </Typography>
          {isDeleting && (
            <>
              <Typography level="body-sm" sx={{ mt: 1 }}>
                Deleting…
              </Typography>
              <LinearProgress sx={{ mt: 1 }} />
            </>
          )}
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
            disabled={isDeleting || total === 0}
            startDecorator={
              isDeleting ? (
                <CircularProgress size="sm" color="danger" />
              ) : undefined
            }
          >
            {isDeleting ? 'Deleting…' : `Delete ${total}`}
          </Button>
        </DialogActions>
      </ModalDialog>
    </Modal>
  );
}
