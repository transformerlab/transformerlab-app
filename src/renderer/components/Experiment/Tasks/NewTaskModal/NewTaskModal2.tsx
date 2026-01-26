import * as React from 'react';
import Modal from '@mui/joy/Modal';
import DialogTitle from '@mui/joy/DialogTitle';
import DialogContent from '@mui/joy/DialogContent';
import DialogActions from '@mui/joy/DialogActions';
import Button from '@mui/joy/Button';
import { ModalClose, ModalDialog, Divider } from '@mui/joy';
import { PlayIcon } from 'lucide-react';

type NewTaskModal2Props = {
  open: boolean;
  onClose: () => void;
};

export default function NewTaskModal2({ open, onClose }: NewTaskModal2Props) {
  return (
    <Modal open={open} onClose={onClose}>
      <ModalDialog
        sx={{
          maxWidth: 700,
          width: '90%',
          maxHeight: '90vh',
          overflow: 'auto',
        }}
      >
        <ModalClose />
        <DialogTitle>New Task</DialogTitle>
        <Divider />
        <DialogContent>{/* Empty content area */}</DialogContent>
        <DialogActions>
          <Button variant="plain" color="neutral" onClick={onClose}>
            Close
          </Button>
          <Button startDecorator={<PlayIcon />} color="success">
            Submit
          </Button>
        </DialogActions>
      </ModalDialog>
    </Modal>
  );
}
