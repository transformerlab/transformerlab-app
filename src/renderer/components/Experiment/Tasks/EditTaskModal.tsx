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
  FormHelperText,
  ModalClose,
  ModalDialog,
  Select,
  Option,
  IconButton,
  Stack,
  Checkbox,
} from '@mui/joy';
import { Editor } from '@monaco-editor/react';
import fairyflossTheme from '../../Shared/fairyfloss.tmTheme.js';
import { Trash2Icon, PlusIcon } from 'lucide-react';

import * as chatAPI from 'renderer/lib/transformerlab-api-sdk';
import { useNotification } from 'renderer/components/Shared/NotificationSystem';
import { SafeJSONParse } from 'renderer/components/Shared/SafeJSONParse';
import { useRef } from 'react';

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

type EditTaskModalProps = {
  open: boolean;
  onClose: () => void;
  task: any | null;
  onSaved?: () => void;
  providers: ProviderOption[];
  isProvidersLoading?: boolean;
};

export default function EditTaskModal({
  open,
  onClose,
  task,
  onSaved = () => {},
  providers,
  isProvidersLoading = false,
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
  const [envVars, setEnvVars] = React.useState<
    Array<{ key: string; value: string }>
  >([{ key: '', value: '' }]);
  const [fileMounts, setFileMounts] = React.useState<
    Array<{
      remotePath: string;
      file?: File | null;
      storedPath?: string;
    }>
  >([{ remotePath: '', file: null, storedPath: undefined }]);
  const [saving, setSaving] = React.useState(false);
  const [selectedProviderId, setSelectedProviderId] = React.useState('');
  const [githubEnabled, setGithubEnabled] = React.useState(false);
  const [githubRepoUrl, setGithubRepoUrl] = React.useState('');
  const [githubDirectory, setGithubDirectory] = React.useState('');

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
    setSelectedProviderId(cfg.provider_id || '');
    // Initialize env_vars from config
    if (cfg.env_vars && typeof cfg.env_vars === 'object') {
      const envVarsArray = Object.entries(cfg.env_vars).map(([key, value]) => ({
        key,
        value: String(value),
      }));
      setEnvVars(
        envVarsArray.length > 0 ? envVarsArray : [{ key: '', value: '' }],
      );
    } else {
      setEnvVars([{ key: '', value: '' }]);
    }

    // Initialize file_mounts from config
    if (cfg.file_mounts && typeof cfg.file_mounts === 'object') {
      const fmArray = Object.entries(cfg.file_mounts).map(
        ([remotePath, storedPath]) => ({
          remotePath,
          file: null,
          storedPath: String(storedPath),
        }),
      );
      setFileMounts(
        fmArray.length > 0
          ? fmArray
          : [{ remotePath: '', file: null, storedPath: undefined }],
      );
    } else {
      setFileMounts([{ remotePath: '', file: null, storedPath: undefined }]);
    }

    // Initialize GitHub fields from config
    setGithubEnabled(cfg.github_enabled || false);
    setGithubRepoUrl(cfg.github_repo_url || '');
    setGithubDirectory(cfg.github_directory || '');
  }, [task]);

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
    if (!selectedProviderId) {
      addNotification({
        type: 'warning',
        message: 'Select a provider before saving.',
      });
      return;
    }
    setSaving(true);

    // Convert env_vars array to object, filtering out empty entries
    const envVarsObj: Record<string, string> = {};
    envVars.forEach(({ key, value }) => {
      if (key.trim() && value.trim()) {
        envVarsObj[key.trim()] = value.trim();
      }
    });

    // Upload any files for file mounts and build mapping {remotePath: storedPath}
    const fileMountsObj: Record<string, string> = {};
    for (let i = 0; i < fileMounts.length; i += 1) {
      const fm = fileMounts[i];
      const remotePath = fm.remotePath.trim();
      if (!remotePath) continue;

      // If we already have a storedPath and no new file, reuse it
      if (!fm.file && fm.storedPath) {
        fileMountsObj[remotePath] = fm.storedPath;
        continue;
      }

      if (!fm.file) continue;
      if (!selectedProviderId) continue;

      try {
        const formData = new FormData();
        formData.append('file', fm.file);
        // Use 0 as template ID for now; stored path is independent of ID
        const uploadUrl = chatAPI.Endpoints.ComputeProvider.UploadTaskFile(
          selectedProviderId,
          0,
        );
        const resp = await chatAPI.authenticatedFetch(uploadUrl, {
          method: 'POST',
          body: formData,
        });
        if (!resp.ok) {
          const txt = await resp.text();
          addNotification({
            type: 'danger',
            message: `Failed to upload file for mount ${remotePath}: ${txt}`,
          });
          setSaving(false);
          return;
        }
        const json = await resp.json();
        if (json.status !== 'success' || !json.stored_path) {
          addNotification({
            type: 'danger',
            message: `Upload for mount ${remotePath} did not return stored_path`,
          });
          setSaving(false);
          return;
        }
        fileMountsObj[remotePath] = json.stored_path;
      } catch (err) {
        console.error(err);
        addNotification({
          type: 'danger',
          message: `Failed to upload file for mount ${remotePath}`,
        });
        setSaving(false);
        return;
      }
    }

    // Preserve existing config and only update editable fields
    // GitHub fields are preserved from existing config (read-only)
    const existingConfig = SafeJSONParse(task.config, {});
    const config = {
      ...existingConfig, // Keep all existing fields (including GitHub settings)
      cluster_name: clusterName,
      command: commandValue,
      cpus: cpus || undefined,
      memory: memory || undefined,
      disk_space: diskSpace || undefined,
      accelerators: accelerators || undefined,
      num_nodes: numNodes ? parseInt(numNodes, 10) : undefined,
      setup: setupValue || undefined,
      env_vars: Object.keys(envVarsObj).length > 0 ? envVarsObj : undefined,
      provider_id: selectedProviderId,
      file_mounts:
        Object.keys(fileMountsObj).length > 0 ? fileMountsObj : undefined,
      // GitHub fields are preserved from existingConfig (not editable)
      // Only update if they don't exist in existing config (shouldn't happen, but safety)
      github_enabled:
        existingConfig.github_enabled || githubEnabled || undefined,
      github_repo_url:
        existingConfig.github_repo_url || githubRepoUrl || undefined,
      github_directory:
        existingConfig.github_directory || githubDirectory || undefined,
    } as any;
    const providerMeta = providers.find(
      (provider) => provider.id === selectedProviderId,
    );
    if (providerMeta) {
      config.provider_name = providerMeta.name;
    }

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

            <FormControl required sx={{ mt: 2 }}>
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
                  saving || isProvidersLoading || providers.length === 0
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
                Choose which provider this template should use.
              </FormHelperText>
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

            <FormControl sx={{ mt: 2 }}>
              <FormLabel>Environment Variables</FormLabel>
              <Stack spacing={1}>
                {envVars.map((envVar, index) => (
                  <Stack
                    key={index}
                    direction="row"
                    spacing={1}
                    alignItems="center"
                  >
                    <Input
                      placeholder="Key"
                      value={envVar.key}
                      onChange={(e) => {
                        const newEnvVars = [...envVars];
                        newEnvVars[index].key = e.target.value;
                        setEnvVars(newEnvVars);
                      }}
                      sx={{ flex: 1 }}
                    />
                    <Input
                      placeholder="Value"
                      value={envVar.value}
                      onChange={(e) => {
                        const newEnvVars = [...envVars];
                        newEnvVars[index].value = e.target.value;
                        setEnvVars(newEnvVars);
                      }}
                      sx={{ flex: 1 }}
                    />
                    <IconButton
                      color="danger"
                      variant="plain"
                      onClick={() => {
                        if (envVars.length > 1) {
                          setEnvVars(envVars.filter((_, i) => i !== index));
                        } else {
                          setEnvVars([{ key: '', value: '' }]);
                        }
                      }}
                    >
                      <Trash2Icon size={16} />
                    </IconButton>
                  </Stack>
                ))}
                <Button
                  variant="outlined"
                  size="sm"
                  startDecorator={<PlusIcon size={16} />}
                  onClick={() =>
                    setEnvVars([...envVars, { key: '', value: '' }])
                  }
                >
                  Add Environment Variable
                </Button>
              </Stack>
              <FormHelperText>
                Optional environment variables to set when launching the cluster
              </FormHelperText>
            </FormControl>
            <FormControl sx={{ mt: 2 }}>
              <FormLabel>File Mounts</FormLabel>
              <FormHelperText>
                For each mount, choose a remote path and upload a file to be
                staged on the server.
              </FormHelperText>
              <Stack spacing={1} sx={{ mt: 1 }}>
                {fileMounts.map((fm, index) => (
                  <Stack
                    key={index}
                    direction="row"
                    spacing={1}
                    alignItems="center"
                    sx={{ flexWrap: 'wrap' }}
                  >
                    <Input
                      placeholder="/remote/path/on/cluster"
                      value={fm.remotePath}
                      onChange={(e) => {
                        const next = [...fileMounts];
                        next[index].remotePath = e.target.value;
                        setFileMounts(next);
                      }}
                      sx={{ flex: 1, minWidth: '200px' }}
                    />
                    <input
                      type="file"
                      onChange={(e) => {
                        const file = e.target.files?.[0] || null;
                        const next = [...fileMounts];
                        next[index].file = file;
                        setFileMounts(next);
                      }}
                    />
                    <IconButton
                      color="danger"
                      variant="plain"
                      onClick={() => {
                        if (fileMounts.length === 1) {
                          setFileMounts([
                            {
                              remotePath: '',
                              file: null,
                              storedPath: undefined,
                            },
                          ]);
                        } else {
                          setFileMounts(
                            fileMounts.filter((_, i) => i !== index),
                          );
                        }
                      }}
                    >
                      <Trash2Icon size={16} />
                    </IconButton>
                  </Stack>
                ))}
                <Button
                  variant="outlined"
                  size="sm"
                  startDecorator={<PlusIcon size={16} />}
                  onClick={() =>
                    setFileMounts([
                      ...fileMounts,
                      { remotePath: '', file: null, storedPath: undefined },
                    ])
                  }
                >
                  Add File Mount
                </Button>
              </Stack>
            </FormControl>

            {githubEnabled && (
              <FormControl sx={{ mt: 2 }}>
                <FormLabel>GitHub Repository (Read-Only)</FormLabel>
                <Stack spacing={2} sx={{ mt: 1 }}>
                  <FormControl>
                    <FormLabel>GitHub Repository URL</FormLabel>
                    <Input
                      value={githubRepoUrl}
                      disabled
                      readOnly
                      placeholder="https://github.com/owner/repo.git"
                      sx={{
                        bgcolor: 'background.level1',
                        cursor: 'not-allowed',
                      }}
                    />
                    <FormHelperText>
                      GitHub repository URL (read-only - source of truth)
                    </FormHelperText>
                  </FormControl>
                  {githubDirectory && (
                    <FormControl>
                      <FormLabel>Directory Path</FormLabel>
                      <Input
                        value={githubDirectory}
                        disabled
                        readOnly
                        placeholder="path/to/directory"
                        sx={{
                          bgcolor: 'background.level1',
                          cursor: 'not-allowed',
                        }}
                      />
                      <FormHelperText>
                        Directory path (read-only - source of truth)
                      </FormHelperText>
                    </FormControl>
                  )}
                </Stack>
                <FormHelperText sx={{ mt: 1 }}>
                  GitHub repository settings are read-only. To change the
                  repository, create a new task. You can edit the parsed
                  configuration values above.
                </FormHelperText>
              </FormControl>
            )}

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
            <Button
              type="submit"
              variant="solid"
              loading={saving}
              disabled={saving || providers.length === 0}
            >
              Save Changes
            </Button>
          </DialogActions>
        </form>
      </ModalDialog>
    </Modal>
  );
}
