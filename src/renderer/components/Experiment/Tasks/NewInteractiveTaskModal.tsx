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
  Select,
  Option,
} from '@mui/joy';
import { ArrowLeftIcon, ArrowRightIcon } from 'lucide-react';

type ProviderOption = {
  id: string;
  name: string;
};

type NewInteractiveTaskModalProps = {
  open: boolean;
  onClose: () => void;
  onSubmit: (data: {
    title: string;
    cpus?: string;
    memory?: string;
    accelerators?: string;
    interactive_type: 'vscode' | 'jupyter';
    provider_id?: string;
  }) => void;
  isSubmitting?: boolean;
  providers: ProviderOption[];
  isProvidersLoading?: boolean;
};

export default function NewInteractiveTaskModal({
  open,
  onClose,
  onSubmit,
  isSubmitting = false,
  providers,
  isProvidersLoading = false,
}: NewInteractiveTaskModalProps) {
  const [title, setTitle] = React.useState('');
  const [cpus, setCpus] = React.useState('');
  const [memory, setMemory] = React.useState('');
  const [accelerators, setAccelerators] = React.useState('');
  const [interactiveType, setInteractiveType] = React.useState<
    'vscode' | 'jupyter'
  >('vscode');
  const [selectedProviderId, setSelectedProviderId] = React.useState('');

  React.useEffect(() => {
    if (!open) {
      setTitle('');
      setCpus('');
      setMemory('');
      setAccelerators('');
      setInteractiveType('vscode');
      setSelectedProviderId(providers[0]?.id || '');
    } else if (open && providers.length && !selectedProviderId) {
      setSelectedProviderId(providers[0].id);
    }
  }, [open, providers, selectedProviderId]);

  React.useEffect(() => {
    if (!providers.length) {
      setSelectedProviderId('');
      return;
    }
    if (!selectedProviderId) {
      setSelectedProviderId(providers[0].id);
      return;
    }
    if (!providers.find((p) => p.id === selectedProviderId)) {
      setSelectedProviderId(providers[0].id);
    }
  }, [providers, selectedProviderId]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) {
      return;
    }

    if (!selectedProviderId) {
      return;
    }

    onSubmit({
      title: title.trim(),
      cpus: cpus || undefined,
      memory: memory || undefined,
      accelerators: accelerators || undefined,
      interactive_type: interactiveType,
      provider_id: selectedProviderId,
    });
  };

  const canSubmit = title.trim().length > 0 && !!selectedProviderId;

  return (
    <Modal open={open} onClose={onClose}>
      <ModalDialog
        sx={{ maxHeight: '80vh', width: '60vw', overflow: 'hidden' }}
      >
        <ModalClose />
        <DialogTitle>New Interactive Task</DialogTitle>
        <form onSubmit={handleSubmit}>
          <DialogContent
            sx={{ maxHeight: '60vh', overflow: 'auto', padding: 1 }}
          >
            <Stack spacing={3}>
              <Typography level="body-sm">
                Create a lightweight interactive task template that will launch
                a VS Code tunnel on a remote provider. For this demo, GitHub
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
                <FormLabel>Provider</FormLabel>
                <Select
                  placeholder={
                    providers.length
                      ? 'Select a provider'
                      : 'No providers configured'
                  }
                  value={selectedProviderId || null}
                  onChange={(_, value) => setSelectedProviderId(value || '')}
                  disabled={
                    isSubmitting || isProvidersLoading || providers.length === 0
                  }
                  slotProps={{
                    listbox: { sx: { maxHeight: 240 } },
                  }}
                >
                  {providers.map((provider) => (
                    <Option key={provider.id} value={provider.id}>
                      {provider.name}
                    </Option>
                  ))}
                </Select>
                <FormHelperText>
                  Choose which provider should run this interactive session.
                </FormHelperText>
              </FormControl>

              <FormControl>
                <FormLabel>Interactive Type</FormLabel>
                <RadioGroup
                  value={interactiveType}
                  onChange={(e) =>
                    setInteractiveType(e.target.value as 'vscode' | 'jupyter')
                  }
                >
                  <Radio value="vscode" label="VS Code" />
                  <Radio value="jupyter" label="Jupyter Notebook" />
                </RadioGroup>
                <FormHelperText>
                  Choose VS Code for remote development or Jupyter for notebook
                  access via tunnel.
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
                Setup and command are pre-populated based on the selected
                interactive type (VS Code or Jupyter).
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
