import * as React from 'react';
import Modal from '@mui/joy/Modal';
import DialogTitle from '@mui/joy/DialogTitle';
import DialogContent from '@mui/joy/DialogContent';
import DialogActions from '@mui/joy/DialogActions';
import Button from '@mui/joy/Button';
import Box from '@mui/joy/Box';
import Typography from '@mui/joy/Typography';
import FormControl from '@mui/joy/FormControl';
import FormLabel from '@mui/joy/FormLabel';
import Input from '@mui/joy/Input';
import Textarea from '@mui/joy/Textarea';
import { ModalClose, ModalDialog } from '@mui/joy';

type Task = {
  id?: string;
  title: string;
  description?: string;
  yaml?: string;
};

type Props = {
  open: boolean;
  onClose: () => void;
  task?: Task | null;
  onSave?: (task: Task) => void;
};

export default function TaskModal({ open, onClose, task, onSave }: Props) {
  // initialize editable fields from task or defaults (new)
  const [title, setTitle] = React.useState(task?.title ?? '');
  const [description, setDescription] = React.useState(task?.description ?? '');
  const [yaml, setYaml] = React.useState(
    task?.yaml ?? '# Add YAML definition here\n',
  );

  // keep local state in sync when the task prop changes (e.g., when opening modal)
  React.useEffect(() => {
    setTitle(task?.title ?? '');
    setDescription(task?.description ?? '');
    setYaml(task?.yaml ?? '# Add YAML definition here\n');
  }, [task, open]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const result: Task = {
      id: task?.id ?? `task-${Date.now()}`,
      title: title || 'Untitled Task',
      description: description || '',
      yaml: yaml || '',
    };
    if (onSave) onSave(result);
    onClose();
  };

  const isNew = !task;

  return (
    <Modal open={open} onClose={onClose}>
      <ModalDialog
        sx={{ maxHeight: '90vh', width: '60vw', overflow: 'hidden' }}
      >
        <ModalClose />
        <DialogTitle>{isNew ? 'New Task' : 'Edit Task'}</DialogTitle>

        <form onSubmit={handleSubmit}>
          <DialogContent sx={{ maxHeight: '70vh', overflow: 'auto' }}>
            <FormControl required>
              <FormLabel>Title</FormLabel>
              <Input
                value={title}
                onChange={(e) => {
                  setTitle(e.target.value);
                }}
                placeholder="Task title"
                autoFocus
              />
            </FormControl>

            <FormControl sx={{ mt: 2 }}>
              <FormLabel>Description</FormLabel>
              <Textarea
                minRows={2}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="A short description of this task"
              />
            </FormControl>

            <FormControl required sx={{ mt: 2 }}>
              <FormLabel>YAML Definition</FormLabel>
              <Textarea
                minRows={6}
                value={yaml}
                onChange={(e) => setYaml(e.target.value)}
                placeholder="# YAML configuration"
                sx={{
                  fontFamily:
                    'ui-monospace, SFMono-Regular, Menlo, Monaco, "Roboto Mono", monospace',
                }}
              />
            </FormControl>
          </DialogContent>

          <DialogActions>
            <Button variant="plain" color="neutral" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" variant="solid">
              {isNew ? 'Create Task' : 'Save'}
            </Button>
          </DialogActions>
        </form>
      </ModalDialog>
    </Modal>
  );
}
