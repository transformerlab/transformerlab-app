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
import { Editor } from '@monaco-editor/react';
import fairyflossTheme from '../../Shared/fairyfloss.tmTheme.js';
import { useRef } from 'react';
import { SafeJSONParse } from 'renderer/components/Shared/SafeJSONParse';

const { parseTmTheme } = require('monaco-themes');

type ProviderOption = {
  id: string;
  name: string;
};

function setTheme(editor: any, monaco: any) {
  const themeData = parseTmTheme(fairyflossTheme);

  monaco.editor.defineTheme('my-theme', themeData);
  monaco.editor.setTheme('my-theme');
}

type EditInteractiveTaskModalProps = {
  open: boolean;
  onClose: () => void;
  task: any | null;
  onSaved?: (updated: any) => void | Promise<void>;
  providers: ProviderOption[];
  isProvidersLoading?: boolean;
};

export default function EditInteractiveTaskModal({
  open,
  onClose,
  task,
  onSaved = () => {},
  providers,
  isProvidersLoading = false,
}: EditInteractiveTaskModalProps) {
  const [title, setTitle] = React.useState('');
  const [cpus, setCpus] = React.useState('');
  const [memory, setMemory] = React.useState('');
  const [accelerators, setAccelerators] = React.useState('');
  const [interactiveType, setInteractiveType] = React.useState<
    'vscode' | 'jupyter'
  >('vscode');
  const [setup, setSetup] = React.useState('');
  const [command, setCommand] = React.useState('');
  const [selectedProviderId, setSelectedProviderId] = React.useState('');
  const [isSaving, setIsSaving] = React.useState(false);

  const setupEditorRef = useRef<any>(null);
  const commandEditorRef = useRef<any>(null);

  React.useEffect(() => {
    if (!task) return;

    // For templates, fields are stored directly (not nested in config)
    const cfg = SafeJSONParse(task.config, {});

    // Check if it's a template (no config or config is empty/doesn't have nested structure)
    const isTemplate =
      !task.config ||
      (typeof cfg === 'object' && Object.keys(cfg).length === 0) ||
      (!cfg.command && !cfg.setup && (task as any).command);

    // Use template fields directly if it's a template, otherwise use config
    const taskAny = task as any;

    setTitle(task.name || '');
    setCpus(
      isTemplate
        ? taskAny.cpus != null
          ? String(taskAny.cpus)
          : ''
        : cfg.cpus != null
          ? String(cfg.cpus)
          : '',
    );
    setMemory(
      isTemplate
        ? taskAny.memory != null
          ? String(taskAny.memory)
          : ''
        : cfg.memory != null
          ? String(cfg.memory)
          : '',
    );
    setAccelerators(
      isTemplate ? taskAny.accelerators || '' : cfg.accelerators || '',
    );
    setInteractiveType(
      (taskAny.interactive_type || cfg.interactive_type || 'vscode') as
        | 'vscode'
        | 'jupyter',
    );
    setSetup(
      isTemplate
        ? taskAny.setup != null
          ? String(taskAny.setup)
          : ''
        : cfg.setup != null
          ? String(cfg.setup)
          : '',
    );
    setCommand(isTemplate ? taskAny.command || '' : cfg.command || '');

    // Prefer provider_id if present, otherwise try to infer from provider_name
    const providerId = isTemplate
      ? taskAny.provider_id
      : cfg.provider_id || taskAny.provider_id;
    if (providerId) {
      setSelectedProviderId(String(providerId));
    } else if (taskAny.provider_name && providers.length) {
      const provider = providers.find((p) => p.name === taskAny.provider_name);
      if (provider) {
        setSelectedProviderId(provider.id);
      }
    }
  }, [task, providers]);

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

  function handleSetupEditorDidMount(editor: any, monaco: any) {
    setupEditorRef.current = editor;
    setTheme(editor, monaco);

    // Initialize editor with current setup state
    try {
      if (setup) {
        editor.setValue(setup);
      }
    } catch (e) {
      // ignore if setValue not available
    }

    // Also ensure we update after a brief delay in case state updates after mount
    setTimeout(() => {
      if (setup && editor.getValue() !== setup) {
        try {
          editor.setValue(setup);
        } catch (e) {
          // ignore
        }
      }
    }, 100);
  }

  function handleCommandEditorDidMount(editor: any, monaco: any) {
    commandEditorRef.current = editor;
    setTheme(editor, monaco);

    // Initialize editor with current command state
    try {
      if (command) {
        editor.setValue(command);
      }
    } catch (e) {
      // ignore if setValue not available
    }

    // Also ensure we update after a brief delay in case state updates after mount
    setTimeout(() => {
      if (command && editor.getValue() !== command) {
        try {
          editor.setValue(command);
        } catch (e) {
          // ignore
        }
      }
    }, 100);
  }

  // Keep Monaco editors in sync if the state changes after mount
  React.useEffect(() => {
    if (!task || !open) return;
    if (!setupEditorRef.current) return;

    try {
      if (typeof setupEditorRef.current.setValue === 'function') {
        const setupValue = setup || '';
        setupEditorRef.current.setValue(setupValue);
      }
    } catch (e) {
      // Editor might not be ready yet
      console.warn('Failed to sync setup editor value:', e);
    }
  }, [task, setup, open]);

  React.useEffect(() => {
    if (!task || !open) return;
    if (!commandEditorRef.current) return;

    try {
      if (typeof commandEditorRef.current.setValue === 'function') {
        const commandValue = command || '';
        commandEditorRef.current.setValue(commandValue);
      }
    } catch (e) {
      // Editor might not be ready yet
      console.warn('Failed to sync command editor value:', e);
    }
  }, [task, command, open]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!task) return;
    if (!title.trim()) return;
    if (!selectedProviderId) return;

    setIsSaving(true);
    try {
      const setupValue =
        setupEditorRef?.current?.getValue?.() ?? (setup || undefined);
      const commandValue =
        commandEditorRef?.current?.getValue?.() ?? (command || undefined);

      const body: any = {
        name: title.trim(),
        cpus: cpus || undefined,
        memory: memory || undefined,
        accelerators: accelerators || undefined,
        // interactive_type is fixed for an existing interactive template
        interactive_type: interactiveType,
        setup: setupValue,
        command: commandValue,
        provider_id: selectedProviderId,
      };

      // Preserve provider_name if we can infer it
      const provider = providers.find((p) => p.id === selectedProviderId);
      if (provider) {
        body.provider_name = provider.name;
      }

      // The caller is responsible for actually persisting the changes via API.
      // We just pass the updated fields back up.
      if (onSaved) {
        await onSaved(body);
      }
      onClose();
    } finally {
      setIsSaving(false);
    }
  };

  const canSubmit = title.trim().length > 0 && !!selectedProviderId;

  return (
    <Modal open={open} onClose={onClose}>
      <ModalDialog
        sx={{ maxHeight: '80vh', width: '60vw', overflow: 'hidden' }}
      >
        <ModalClose />
        <DialogTitle>Edit Interactive Task</DialogTitle>
        <form onSubmit={handleSubmit}>
          <DialogContent sx={{ maxHeight: '60vh', overflow: 'auto' }}>
            <Stack spacing={3}>
              <Typography level="body-sm">
                Edit the basic configuration for this interactive task. Setup
                and command remain managed by the interactive task template
                defaults.
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
                    isSaving || isProvidersLoading || providers.length === 0
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
                <Input
                  value={interactiveType === 'vscode' ? 'VS Code' : 'Jupyter'}
                  disabled
                  readOnly
                />
                <FormHelperText>
                  Interactive type is fixed for this template.
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

              <FormControl>
                <FormLabel>Setup Command</FormLabel>
                <Editor
                  defaultLanguage="shell"
                  theme="my-theme"
                  defaultValue={setup}
                  height="6rem"
                  options={{
                    minimap: {
                      enabled: false,
                    },
                    fontSize: 18,
                    cursorStyle: 'block',
                    wordWrap: 'on',
                  }}
                  onMount={handleSetupEditorDidMount}
                />
                <FormHelperText>
                  These commands run before the interactive environment starts.
                </FormHelperText>
              </FormControl>

              <FormControl>
                <FormLabel>Command</FormLabel>
                <Editor
                  defaultLanguage="shell"
                  theme="my-theme"
                  defaultValue={command}
                  height="8rem"
                  options={{
                    minimap: {
                      enabled: false,
                    },
                    fontSize: 18,
                    cursorStyle: 'block',
                    wordWrap: 'on',
                  }}
                  onMount={handleCommandEditorDidMount}
                />
                <FormHelperText>
                  For example:{' '}
                  <code>
                    code tunnel --accept-server-license-terms
                    --disable-telemetry
                  </code>
                </FormHelperText>
              </FormControl>
            </Stack>
          </DialogContent>
          <DialogActions>
            <Stack
              direction="row"
              spacing={2}
              sx={{ width: '100%', justifyContent: 'flex-end' }}
            >
              <Button
                variant="plain"
                color="neutral"
                onClick={onClose}
                disabled={isSaving}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                variant="solid"
                loading={isSaving}
                disabled={isSaving || !canSubmit}
              >
                Save Changes
              </Button>
            </Stack>
          </DialogActions>
        </form>
      </ModalDialog>
    </Modal>
  );
}
