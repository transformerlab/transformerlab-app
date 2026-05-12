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

export type DeleteTaskConfirmModalProps = {
  open: boolean;
  onClose: () => void;
  taskIds: string[];
  taskName?: string | null;
  onConfirm: (taskId: string) => Promise<boolean>;
  onComplete?: (succeeded: number, failed: number) => void;
};

export default function DeleteTaskConfirmModal({
  open,
  onClose,
  taskIds,
  taskName,
  onConfirm,
  onComplete,
}: DeleteTaskConfirmModalProps) {
  const [isDeleting, setIsDeleting] = React.useState(false);
  const [completedCount, setCompletedCount] = React.useState(0);
  const [failedCount, setFailedCount] = React.useState(0);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!open) {
      setIsDeleting(false);
      setCompletedCount(0);
      setFailedCount(0);
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
    setCompletedCount(0);
    setFailedCount(0);

    let succeeded = 0;
    let failures = 0;
    await Promise.all(
      taskIds.map(async (id) => {
        try {
          const ok = await onConfirm(id);
          if (ok) {
            succeeded += 1;
            setCompletedCount((c) => c + 1);
          } else {
            failures += 1;
            setFailedCount((c) => c + 1);
          }
        } catch (err) {
          console.error('Error deleting template:', err);
          failures += 1;
          setFailedCount((c) => c + 1);
        }
      }),
    );

    setIsDeleting(false);
    onComplete?.(succeeded, failures);
    if (failures === 0) {
      onClose();
    } else if (taskIds.length === 1) {
      setError('Failed to delete task. Please try again.');
    } else {
      setError(
        `${failures} of ${taskIds.length} tasks failed to delete. Please try again.`,
      );
    }
  }, [taskIds, isDeleting, onConfirm, onClose, onComplete]);

  const total = taskIds.length;
  const processed = completedCount + failedCount;
  const progressValue = total > 0 ? (processed / total) * 100 : 0;
  const isBulk = total > 1;

  const title = isBulk ? `Delete ${total} tasks?` : 'Delete task?';

  const singleDisplayName = taskName || 'this task';

  const description = isBulk
    ? `Are you sure you want to delete ${total} selected tasks? This action cannot be undone.`
    : `Are you sure you want to delete ${singleDisplayName}? This action cannot be undone.`;

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
        sx={{ minWidth: isBulk ? 380 : 360 }}
      >
        <DialogTitle id="delete-task-title">{title}</DialogTitle>
        <DialogContent id="delete-task-description">
          <Typography>{description}</Typography>
          {isBulk && isDeleting && (
            <Typography level="body-sm" sx={{ mt: 1 }}>
              Deleting {processed} / {total}…
            </Typography>
          )}
          {isBulk && isDeleting && (
            <LinearProgress determinate value={progressValue} sx={{ mt: 1 }} />
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
            {isDeleting ? 'Deleting…' : isBulk ? `Delete ${total}` : 'Delete'}
          </Button>
        </DialogActions>
      </ModalDialog>
    </Modal>
  );
}
