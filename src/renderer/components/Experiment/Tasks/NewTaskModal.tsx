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
  onSubmit: (data: {
    title: string;
    cluster_name: string;
    command: string;
    cpus?: string;
    memory?: string;
    disk_space?: string;
    accelerators?: string;
    num_nodes?: number;
    setup?: string;
  }) => void;
  isSubmitting?: boolean;
};

export default function NewTaskModal({
  open,
  onClose,
  onSubmit,
  isSubmitting = false,
}: NewTaskModalProps) {
  const [title, setTitle] = React.useState('');
  const [clusterName, setClusterName] = React.useState('');
  const [command, setCommand] = React.useState('');
  const [cpus, setCpus] = React.useState('');
  const [memory, setMemory] = React.useState('');
  const [diskSpace, setDiskSpace] = React.useState('');
  const [accelerators, setAccelerators] = React.useState('');
  const [numNodes, setNumNodes] = React.useState('');
  const [setup, setSetup] = React.useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit({
      title,
      cluster_name: clusterName,
      command,
      cpus: cpus || undefined,
      memory: memory || undefined,
      disk_space: diskSpace || undefined,
      accelerators: accelerators || undefined,
      num_nodes: numNodes ? parseInt(numNodes, 10) : undefined,
      setup: setup || undefined,
    });
    // Reset all form fields
    setTitle('');
    setClusterName('');
    setCommand('');
    setCpus('');
    setMemory('');
    setDiskSpace('');
    setAccelerators('');
    setNumNodes('');
    setSetup('');
    onClose();
  };

  return (
    <Modal open={open} onClose={onClose}>
      <ModalDialog sx={{ maxHeight: '90vh', overflow: 'hidden' }}>
        <ModalClose />
        <DialogTitle>New Task</DialogTitle>
        <form onSubmit={handleSubmit}>
          <DialogContent sx={{ maxHeight: '70vh', overflow: 'auto' }}>
            <FormControl required>
              <FormLabel>Title</FormLabel>
              <Input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Task title"
                autoFocus
              />
            </FormControl>

            <FormControl required sx={{ mt: 2 }}>
              <FormLabel>Cluster Name</FormLabel>
              <Input
                value={clusterName}
                onChange={(e) => setClusterName(e.target.value)}
                placeholder="Cluster name"
              />
            </FormControl>

            <FormControl sx={{ mt: 2 }}>
              <FormLabel>CPUs</FormLabel>
              <Input
                value={cpus}
                onChange={(e) => setCpus(e.target.value)}
                placeholder="e.g. 2"
              />
            </FormControl>

            <FormControl sx={{ mt: 2 }}>
              <FormLabel>Memory</FormLabel>
              <Input
                value={memory}
                onChange={(e) => setMemory(e.target.value)}
                placeholder="e.g. 4"
              />
            </FormControl>

            <FormControl sx={{ mt: 2 }}>
              <FormLabel>Disk Space</FormLabel>
              <Input
                value={diskSpace}
                onChange={(e) => setDiskSpace(e.target.value)}
                placeholder="e.g. 20"
              />
            </FormControl>

            <FormControl sx={{ mt: 2 }}>
              <FormLabel>Accelerators</FormLabel>
              <Input
                value={accelerators}
                onChange={(e) => setAccelerators(e.target.value)}
                placeholder="e.g. RTX3090:1"
              />
            </FormControl>

            <FormControl sx={{ mt: 2 }}>
              <FormLabel>Number of Nodes</FormLabel>
              <Input
                type="number"
                value={numNodes}
                onChange={(e) => setNumNodes(e.target.value)}
                placeholder="e.g. 1"
              />
            </FormControl>

            <FormControl sx={{ mt: 2 }}>
              <FormLabel>Setup Command</FormLabel>
              <Textarea
                minRows={2}
                value={setup}
                onChange={(e) => setSetup(e.target.value)}
                placeholder="Setup commands (optional)"
              />
            </FormControl>

            <FormControl required sx={{ mt: 2 }}>
              <FormLabel>Command</FormLabel>
              <Textarea
                minRows={4}
                value={command}
                onChange={(e) => setCommand(e.target.value)}
                placeholder="Command to run"
              />
            </FormControl>
          </DialogContent>
          <DialogActions>
            <Button
              variant="plain"
              color="neutral"
              onClick={onClose}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
            <Button type="submit" variant="solid" loading={isSubmitting}>
              Create Task
            </Button>
          </DialogActions>
        </form>
      </ModalDialog>
    </Modal>
  );
}
