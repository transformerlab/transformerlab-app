import * as React from 'react';
import Modal from '@mui/joy/Modal';
import DialogTitle from '@mui/joy/DialogTitle';
import DialogContent from '@mui/joy/DialogContent';
import DialogActions from '@mui/joy/DialogActions';
import Button from '@mui/joy/Button';
import FormControl from '@mui/joy/FormControl';
import FormLabel from '@mui/joy/FormLabel';
import Input from '@mui/joy/Input';
import Textarea from '@mui/joy/Textarea';
import { ModalClose, ModalDialog } from '@mui/joy';

type NewTaskModalProps = {
  open: boolean;
  onClose: () => void;
  onSubmit: (data: { title: string; resources: string; code: string }) => void;
};

export default function NewTaskModal({
  open,
  onClose,
  onSubmit,
}: NewTaskModalProps) {
  const [title, setTitle] = React.useState('');
  const [resources, setResources] = React.useState('');
  const [code, setCode] = React.useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit({ title, resources, code });
    setTitle('');
    setResources('');
    setCode('');
    onClose();
  };

  return (
    <Modal open={open} onClose={onClose}>
      <ModalDialog>
        <ModalClose />
        <DialogTitle>New Task</DialogTitle>
        <form onSubmit={handleSubmit}>
          <DialogContent>
            <FormControl required>
              <FormLabel>Title</FormLabel>
              <Input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Task title"
                autoFocus
              />
            </FormControl>
            <FormControl sx={{ mt: 2 }}>
              <FormLabel>Resource Requirements</FormLabel>
              <Input
                value={resources}
                onChange={(e) => setResources(e.target.value)}
                placeholder="e.g. 2 CPUs, 4GB RAM"
              />
            </FormControl>
            <FormControl sx={{ mt: 2 }}>
              <FormLabel>Code</FormLabel>
              <Textarea
                minRows={4}
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder="Paste your code here"
              />
            </FormControl>
          </DialogContent>
          <DialogActions>
            <Button variant="plain" color="neutral" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" variant="solid">
              Create Task
            </Button>
          </DialogActions>
        </form>
      </ModalDialog>
    </Modal>
  );
}
