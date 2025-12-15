import * as React from 'react';
import Modal from '@mui/joy/Modal';
import DialogTitle from '@mui/joy/DialogTitle';
import DialogContent from '@mui/joy/DialogContent';
import DialogActions from '@mui/joy/DialogActions';
import Button from '@mui/joy/Button';
import FormControl from '@mui/joy/FormControl';
import FormLabel from '@mui/joy/FormLabel';
import Input from '@mui/joy/Input';
import {
  ModalClose,
  ModalDialog,
  Stack,
  Radio,
  RadioGroup,
  FormHelperText,
  Typography,
} from '@mui/joy';
import { ArrowLeftIcon, ArrowRightIcon } from 'lucide-react';

type NewInteractiveTaskModalProps = {
  open: boolean;
  onClose: () => void;
  onSubmit: (data: {
    title: string;
    cpus?: string;
    memory?: string;
    accelerators?: string;
    interactive_type: 'vscode' | 'jupyter';
  }) => void;
  isSubmitting?: boolean;
};

export default function NewInteractiveTaskModal({
  open,
  onClose,
  onSubmit,
  isSubmitting = false,
}: NewInteractiveTaskModalProps) {
  const [title, setTitle] = React.useState('');
  const [cpus, setCpus] = React.useState('');
  const [memory, setMemory] = React.useState('');
  const [accelerators, setAccelerators] = React.useState('');
  const [interactiveType, setInteractiveType] =
    React.useState<'vscode' | 'jupyter'>('vscode');

  React.useEffect(() => {
    if (!open) {
      setTitle('');
      setCpus('');
      setMemory('');
      setAccelerators('');
      setInteractiveType('vscode');
    }
  }, [open]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) {
      return;
    }

    onSubmit({
      title: title.trim(),
      cpus: cpus || undefined,
      memory: memory || undefined,
      accelerators: accelerators || undefined,
      interactive_type: interactiveType,
    });
  };

  const canSubmit = title.trim().length > 0;

  return (
    <Modal open={open} onClose={onClose}>
      <ModalDialog sx={{ maxHeight: '80vh', width: '60vw', overflow: 'hidden' }}>
        <ModalClose />
        <DialogTitle>New Interactive Task</DialogTitle>
        <form onSubmit={handleSubmit}>
          <DialogContent sx={{ maxHeight: '60vh', overflow: 'auto' }}>
            <Stack spacing={3}>
              <Typography level="body-sm">
                Create a lightweight interactive task template that will launch a
                VS Code tunnel on a remote provider. For this demo, GitHub
                options are disabled; only basic resources and type selection
                are supported.
              </Typography>

              <FormControl required>
                <FormLabel>Title</FormLabel>
                <Input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Interactive session name"
                  autoFocus
                />
              </FormControl>

              <FormControl>
                <FormLabel>Interactive Type</FormLabel>
                <RadioGroup
                  value={interactiveType}
                  onChange={(e) =>
                    setInteractiveType(e.target.value as 'vscode' | 'jupyter')
                  }
                >
                  <Radio value="vscode" label="VS Code (remote tunnel)" />
                  <Radio
                    value="jupyter"
                    label="Jupyter Notebook (coming soon)"
                    disabled
                  />
                </RadioGroup>
                <FormHelperText>
                  Currently only VS Code is supported; Jupyter is shown for
                  future expansion.
                </FormHelperText>
              </FormControl>

              <Stack
                direction="row"
                spacing={2}
                sx={{ flexWrap: 'wrap', rowGap: 2 }}
              >
                <FormControl sx={{ minWidth: '160px', flex: 1 }}>
                  <FormLabel>CPUs</FormLabel>
                  <Input
                    value={cpus}
                    onChange={(e) => setCpus(e.target.value)}
                    placeholder="e.g. 4"
                  />
                </FormControl>

                <FormControl sx={{ minWidth: '160px', flex: 1 }}>
                  <FormLabel>Memory (GB)</FormLabel>
                  <Input
                    value={memory}
                    onChange={(e) => setMemory(e.target.value)}
                    placeholder="e.g. 16"
                  />
                </FormControl>

                <FormControl sx={{ minWidth: '200px', flex: 2 }}>
                  <FormLabel>Accelerators</FormLabel>
                  <Input
                    value={accelerators}
                    onChange={(e) => setAccelerators(e.target.value)}
                    placeholder="e.g. RTX3090:1 or H100:8"
                  />
                </FormControl>
              </Stack>

              <FormHelperText>
                Setup and command are pre-populated to install VS Code and start
                a `code tunnel` session when the job is queued.
              </FormHelperText>
            </Stack>
          </DialogContent>
          <DialogActions>
            <Stack
              direction="row"
              spacing={2}
              sx={{ width: '100%', justifyContent: 'space-between' }}
            >
              <Button
                variant="plain"
                color="neutral"
                onClick={onClose}
                disabled={isSubmitting}
                startDecorator={<ArrowLeftIcon size={16} />}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                variant="solid"
                loading={isSubmitting}
                disabled={isSubmitting || !canSubmit}
                endDecorator={<ArrowRightIcon size={16} />}
              >
                Create Interactive Task
              </Button>
            </Stack>
          </DialogActions>
        </form>
      </ModalDialog>
    </Modal>
  );
}


