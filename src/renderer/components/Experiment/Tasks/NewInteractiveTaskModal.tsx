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
  Alert,
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
    interactive_type: 'vscode' | 'jupyter' | 'vllm' | 'ssh' | 'ollama';
    provider_id?: string;
    model_name?: string;
    hf_token?: string;
    tp_size?: string;
    ngrok_auth_token?: string;
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
    'vscode' | 'jupyter' | 'vllm' | 'ssh' | 'ollama'
  >('vscode');
  const [selectedProviderId, setSelectedProviderId] = React.useState('');
  const [modelName, setModelName] = React.useState('');
  const [hfToken, setHfToken] = React.useState('');
  const [tpSize, setTpSize] = React.useState('1');
  const [ngrokAuthToken, setNgrokAuthToken] = React.useState('');

  React.useEffect(() => {
    if (!open) {
      setTitle('');
      setCpus('');
      setMemory('');
      setAccelerators('');
      setInteractiveType('vscode');
      setSelectedProviderId(providers[0]?.id || '');
      setModelName('');
      setHfToken('');
      setTpSize('1');
      setNgrokAuthToken('');
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
      model_name:
        interactiveType === 'vllm' || interactiveType === 'ollama'
          ? modelName
          : undefined,
      hf_token: interactiveType === 'vllm' ? hfToken : undefined,
      tp_size: interactiveType === 'vllm' ? tpSize : undefined,
      ngrok_auth_token: interactiveType === 'ssh' ? ngrokAuthToken : undefined,
    });
  };

  const canSubmit =
    title.trim().length > 0 &&
    !!selectedProviderId &&
    (interactiveType !== 'vllm' || modelName.trim().length > 0) &&
    (interactiveType !== 'ollama' || modelName.trim().length > 0) &&
    (interactiveType !== 'ssh' || ngrokAuthToken.trim().length > 0);

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
                    setInteractiveType(
                      e.target.value as
                        | 'vscode'
                        | 'jupyter'
                        | 'vllm'
                        | 'ssh'
                        | 'ollama',
                    )
                  }
                >
                  <Radio value="vscode" label="VS Code" />
                  <Radio value="jupyter" label="Jupyter Notebook" />
                  <Radio value="vllm" label="vLLM Server" />
                  <Radio value="ollama" label="Ollama" />
                  <Radio value="ssh" label="SSH" />
                </RadioGroup>
                <FormHelperText>
                  Choose VS Code for remote development, Jupyter for notebook
                  access, vLLM for model serving, Ollama for running Ollama
                  models, or SSH for direct terminal access via tunnel.
                </FormHelperText>
              </FormControl>

              {interactiveType === 'vllm' && (
                <>
                  <FormControl required>
                    <FormLabel>Model Name</FormLabel>
                    <Input
                      value={modelName}
                      onChange={(e) => setModelName(e.target.value)}
                      placeholder="e.g. meta-llama/Llama-2-7b-chat-hf"
                    />
                    <FormHelperText>
                      HuggingFace model identifier
                    </FormHelperText>
                  </FormControl>

                  <FormControl>
                    <FormLabel>HuggingFace Token</FormLabel>
                    <Input
                      type="password"
                      value={hfToken}
                      onChange={(e) => setHfToken(e.target.value)}
                      placeholder="hf_..."
                    />
                    <FormHelperText>
                      Optional: Required for private/gated models
                    </FormHelperText>
                  </FormControl>

                  <FormControl>
                    <FormLabel>Tensor Parallel Size</FormLabel>
                    <Input
                      type="number"
                      value={tpSize}
                      onChange={(e) => setTpSize(e.target.value)}
                      placeholder="1"
                    />
                    <FormHelperText>
                      Number of GPUs for tensor parallelism (default: 1)
                    </FormHelperText>
                  </FormControl>
                </>
              )}

              {interactiveType === 'ollama' && (
                <>
                  <FormControl required>
                    <FormLabel>Model Name</FormLabel>
                    <Input
                      value={modelName}
                      onChange={(e) => setModelName(e.target.value)}
                      placeholder="e.g. llama2, mistral, codellama"
                    />
                    <FormHelperText>
                      Ollama model name (e.g. llama2, mistral, codellama). Use
                      "ollama pull &lt;model&gt;" to download models.
                    </FormHelperText>
                  </FormControl>
                </>
              )}

              {interactiveType === 'ssh' && (
                <>
                  <Alert color="warning" variant="soft">
                    <Typography
                      level="body-sm"
                      fontWeight="bold"
                      sx={{ mb: 0.5 }}
                    >
                      Security Warning
                    </Typography>
                    <Typography level="body-xs">
                      This will create a public TCP tunnel. Be careful when
                      sharing the SSH command with anyone, as it provides direct
                      access to your remote machine.
                    </Typography>
                  </Alert>
                  <FormControl required>
                    <FormLabel>ngrok Auth Token</FormLabel>
                    <Input
                      type="password"
                      value={ngrokAuthToken}
                      onChange={(e) => setNgrokAuthToken(e.target.value)}
                      placeholder="ngrok_..."
                    />
                    <FormHelperText>
                      Your ngrok authentication token. Note: You may need to add
                      a payment method to your ngrok account (it won't be
                      charged, but it's necessary for SSH connections). You can
                      get your token from
                      <a
                        href="https://dashboard.ngrok.com/get-started/your-authtoken"
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        here
                      </a>
                      .
                    </FormHelperText>
                  </FormControl>
                </>
              )}

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
                interactive type (VS Code, Jupyter, vLLM, Ollama, or SSH).
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
