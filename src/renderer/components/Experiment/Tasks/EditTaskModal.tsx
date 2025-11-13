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
import {
  FormHelperText,
  ModalClose,
  ModalDialog,
  Sheet,
  Stack,
  Typography,
} from '@mui/joy';
import { FolderIcon } from 'lucide-react';
import { Editor } from '@monaco-editor/react';
import fairyflossTheme from '../../Shared/fairyfloss.tmTheme.js';

import * as chatAPI from 'renderer/lib/transformerlab-api-sdk';
import { useNotification } from 'renderer/components/Shared/NotificationSystem';
import { SafeJSONParse } from 'renderer/components/Shared/SafeJSONParse';
import { useRef } from 'react';

const { parseTmTheme } = require('monaco-themes');

function setTheme(editor: any, monaco: any) {
  const themeData = parseTmTheme(fairyflossTheme);

  monaco.editor.defineTheme('my-theme', themeData);
  monaco.editor.setTheme('my-theme');
}

type EditTaskModalProps = {
  open: boolean;
  onClose: () => void;
  task: any | null;
  onSaved?: () => void;
};

export default function EditTaskModal({
  open,
  onClose,
  task,
  onSaved = () => {},
}: EditTaskModalProps) {
  const { addNotification } = useNotification();
  const [title, setTitle] = React.useState('');
  const [command, setCommand] = React.useState('');
  const [clusterName, setClusterName] = React.useState('');
  const [cpus, setCpus] = React.useState('');
  const [memory, setMemory] = React.useState('');
  const [diskSpace, setDiskSpace] = React.useState('');
  const [accelerators, setAccelerators] = React.useState('');
  const [numNodes, setNumNodes] = React.useState('');
  const [setup, setSetup] = React.useState('');
  const [saving, setSaving] = React.useState(false);

  const setupEditorRef = useRef<any>(null);
  const commandEditorRef = useRef<any>(null);

  React.useEffect(() => {
    if (!task) return;
    setTitle(task.name || '');
    const cfg = SafeJSONParse(task.config, {});
    setClusterName(cfg.cluster_name || '');
    setCommand(cfg.command || '');
    setCpus(cfg.cpus != null ? String(cfg.cpus) : '');
    setMemory(cfg.memory != null ? String(cfg.memory) : '');
    setDiskSpace(cfg.disk_space != null ? String(cfg.disk_space) : '');
    setAccelerators(cfg.accelerators != null ? String(cfg.accelerators) : '');
    setNumNodes(cfg.num_nodes != null ? String(cfg.num_nodes) : '');
    setSetup(cfg.setup != null ? String(cfg.setup) : '');
  }, [task]);

  // Keep Monaco editors in sync if the state changes after mount
  React.useEffect(
    function () {
      if (!task) return function () {};
      if (
        setupEditorRef.current &&
        typeof setupEditorRef.current.setValue === 'function'
      ) {
        setupEditorRef.current.setValue(setup ?? '');
      } else {
        const timeout = setTimeout(function () {
          if (
            setupEditorRef.current &&
            typeof setupEditorRef.current.setValue === 'function'
          ) {
            setupEditorRef.current.setValue(setup ?? '');
          } else {
            alert('Error: Failed to load the setup editor.');
          }
        }, 300);
        return function () {
          clearTimeout(timeout);
        };
      }
      return function () {};
    },
    [task, setup, setupEditorRef],
  );

  React.useEffect(
    function () {
      if (!task) return function () {};
      if (
        commandEditorRef.current &&
        typeof commandEditorRef.current.setValue === 'function'
      ) {
        commandEditorRef.current.setValue(command ?? '');
      } else {
        const timeout = setTimeout(function () {
          if (
            commandEditorRef.current &&
            typeof commandEditorRef.current.setValue === 'function'
          ) {
            commandEditorRef.current.setValue(command ?? '');
          } else {
            alert('Error: Failed to load the command editor.');
          }
        }, 300);
        return function () {
          clearTimeout(timeout);
        };
      }
      return function () {};
    },
    [task, command, commandEditorRef],
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const setupValue =
      setupEditorRef?.current?.getValue?.() ?? (setup || undefined);
    const commandValue =
      commandEditorRef?.current?.getValue?.() ?? (command || undefined);

    if (!task) return;
    if (!commandValue) {
      addNotification({ type: 'warning', message: 'Command is required' });
      return;
    }
    setSaving(true);

    // Preserve existing config and only update editable fields
    const existingConfig = SafeJSONParse(task.config, {});
    const config = {
      ...existingConfig, // Keep all existing fields
      cluster_name: clusterName,
      command: commandValue,
      cpus: cpus || undefined,
      memory: memory || undefined,
      disk_space: diskSpace || undefined,
      accelerators: accelerators || undefined,
      num_nodes: numNodes ? parseInt(numNodes, 10) : undefined,
      setup: setupValue || undefined,
    } as any;

    const body = {
      name: title,
      inputs: '{}',
      config: JSON.stringify(config),
      outputs: '{}',
    } as any;

    try {
      const response = await chatAPI.authenticatedFetch(
        chatAPI.Endpoints.Tasks.UpdateTask(task.id),
        {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            accept: 'application/json',
          },
          body: JSON.stringify(body),
        },
      );

      if (!response.ok) {
        const txt = await response.text();
        addNotification({
          type: 'danger',
          message: `Failed to save task: ${txt}`,
        });
        setSaving(false);
        return;
      }

      if (onSaved) {
        await onSaved();
      }
      onClose();
    } catch (err) {
      console.error(err);
      addNotification({ type: 'danger', message: 'Failed to save task.' });
    } finally {
      setSaving(false);
    }
  };

  function handleSetupEditorDidMount(editor: any, monaco: any) {
    setupEditorRef.current = editor;
    setTheme(editor, monaco);
    // initialize editor with current setup state
    try {
      editor.setValue(setup ?? '');
    } catch (e) {
      // ignore if setValue not available
    }
  }

  function handleCommandEditorDidMount(editor: any, monaco: any) {
    commandEditorRef.current = editor;
    setTheme(editor, monaco);
    // initialize editor with current command state
    try {
      editor.setValue(command ?? '');
    } catch (e) {
      // ignore if setValue not available
    }
  }

  return (
    <Modal open={open} onClose={onClose}>
      <ModalDialog
        sx={{ maxHeight: '90vh', width: '70vw', overflow: 'hidden' }}
      >
        <ModalClose />
        <DialogTitle>Edit Task</DialogTitle>
        <form onSubmit={handleSubmit}>
          <DialogContent sx={{ maxHeight: '70vh', overflow: 'auto' }}>
            <FormControl required>
              <FormLabel>Title</FormLabel>
              <Input
                value={title}
                onChange={(e) => {
                  const newTitle = e.target.value;
                  setTitle(newTitle);
                  // keep cluster name behavior consistent with NewTaskModal
                  setClusterName(`${newTitle}`);
                }}
                placeholder="Task title"
              />
            </FormControl>

            <div
              style={{
                display: 'flex',
                flexWrap: 'wrap',
                gap: '16px',
                marginTop: '16px',
              }}
            >
              <FormControl
                sx={{ flex: '1 1 calc(33.333% - 16px)', minWidth: '150px' }}
              >
                <FormLabel>CPUs</FormLabel>
                <Input
                  value={cpus}
                  onChange={(e) => setCpus(e.target.value)}
                  placeholder="e.g. 2"
                />
              </FormControl>

              <FormControl
                sx={{ flex: '1 1 calc(33.333% - 16px)', minWidth: '150px' }}
              >
                <FormLabel>Memory (in GB)</FormLabel>
                <Input
                  value={memory}
                  onChange={(e) => setMemory(e.target.value)}
                  placeholder="e.g. 4"
                />
              </FormControl>

              <FormControl
                sx={{ flex: '1 1 calc(33.333% - 16px)', minWidth: '150px' }}
              >
                <FormLabel>Disk Space (in GB)</FormLabel>
                <Input
                  value={diskSpace}
                  onChange={(e) => setDiskSpace(e.target.value)}
                  placeholder="e.g. 20"
                />
              </FormControl>
            </div>

            <FormControl sx={{ mt: 2 }}>
              <FormLabel>Accelerators per Node</FormLabel>
              <Input
                value={accelerators}
                onChange={(e) => setAccelerators(e.target.value)}
                placeholder="e.g. RTX3090:1 or H100:8"
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
              {/* <Textarea
                minRows={2}
                value={setup}
                onChange={(e) => setSetup(e.target.value)}
                placeholder="Setup commands (optional) that runs before task is run. e.g. pip install -r requirements.txt"
              /> */}
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
                e.g. <code>pip install -r requirements.txt</code>
              </FormHelperText>
            </FormControl>

            <FormControl required sx={{ mt: 2 }}>
              <FormLabel>Command</FormLabel>
              {/* <Textarea
                minRows={4}
                value={command}
                onChange={(e) => setCommand(e.target.value)}
                placeholder="e.g. python train.py --epochs 10"
              /> */}

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
                e.g. <code>python train.py --epochs 10</code>
              </FormHelperText>
            </FormControl>

            {/* Show uploaded directory indicator if present */}
            {task &&
              (() => {
                const cfg = SafeJSONParse(task.config, {});
                return cfg.uploaded_dir_path ? (
                  <Sheet
                    variant="soft"
                    sx={{ p: 2, borderRadius: 'md', mt: 2 }}
                  >
                    <Stack direction="row" spacing={1} alignItems="center">
                      <FolderIcon size={16} />
                      <Typography level="body-sm">
                        This task includes an uploaded directory
                      </Typography>
                    </Stack>
                  </Sheet>
                ) : null;
              })()}
          </DialogContent>
          <DialogActions>
            <Button
              variant="plain"
              color="neutral"
              onClick={onClose}
              disabled={saving}
            >
              Cancel
            </Button>
            <Button type="submit" variant="solid" loading={saving}>
              Save Changes
            </Button>
          </DialogActions>
        </form>
      </ModalDialog>
    </Modal>
  );
}
