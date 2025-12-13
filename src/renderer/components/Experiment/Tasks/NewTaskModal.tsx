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
  Switch,
  Checkbox,
} from '@mui/joy';
import { Editor } from '@monaco-editor/react';
import fairyflossTheme from '../../Shared/fairyfloss.tmTheme.js';
import { Trash2Icon, PlusIcon } from 'lucide-react';

import { useEffect, useRef, useState } from 'react';
import { useNotification } from 'renderer/components/Shared/NotificationSystem';
import * as chatAPI from 'renderer/lib/transformerlab-api-sdk';

const { parseTmTheme } = require('monaco-themes');

function setTheme(editor: any, monaco: any) {
  const themeData = parseTmTheme(fairyflossTheme);

  monaco.editor.defineTheme('my-theme', themeData);
  monaco.editor.setTheme('my-theme');
}

type ProviderOption = {
  id: string;
  name: string;
};

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
    env_vars?: Record<string, string>;
    provider_id?: string;
    file_mounts?: Record<string, string>;
    github_enabled?: boolean;
    github_repo_url?: string;
    github_directory?: string;
  }) => void;
  isSubmitting?: boolean;
  providers: ProviderOption[];
  isProvidersLoading?: boolean;
};

export default function NewTaskModal({
  open,
  onClose,
  onSubmit,
  isSubmitting = false,
  providers,
  isProvidersLoading = false,
}: NewTaskModalProps) {
  const { addNotification } = useNotification();

  const [title, setTitle] = React.useState('');
  const [clusterName, setClusterName] = React.useState('');
  const [command, setCommand] = React.useState('');
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
      uploading?: boolean;
      storedPath?: string;
    }>
  >([{ remotePath: '', file: null, uploading: false, storedPath: undefined }]);
  const [selectedProviderId, setSelectedProviderId] = useState('');
  const [githubEnabled, setGithubEnabled] = useState(false);
  const [githubRepoUrl, setGithubRepoUrl] = useState('');
  const [githubDirectory, setGithubDirectory] = useState('');
  // keep separate refs for the two Monaco editors
  const setupEditorRef = useRef<any>(null);
  const commandEditorRef = useRef<any>(null);

  useEffect(() => {
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    // read editor values (fallback to state if editor not mounted)
    const setupValue =
      setupEditorRef?.current?.getValue?.() ?? (setup || undefined);
    const commandValue =
      commandEditorRef?.current?.getValue?.() ?? (command || undefined);

    if (!commandValue) {
      addNotification({ type: 'warning', message: 'Command is required' });
      return;
    }

    if (!selectedProviderId) {
      addNotification({
        type: 'warning',
        message: 'Select a provider before creating the task.',
      });
      return;
    }

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

      // If we already have a storedPath (e.g. editing), just reuse it
      if (!fm.file && fm.storedPath) {
        fileMountsObj[remotePath] = fm.storedPath;
        continue;
      }

      if (!fm.file) continue;
      if (!selectedProviderId) continue;

      try {
        const formData = new FormData();
        formData.append('file', fm.file);
        // task_id is not yet created; we treat this as "template" upload, so use 0
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
          return;
        }
        const json = await resp.json();
        if (json.status !== 'success' || !json.stored_path) {
          addNotification({
            type: 'danger',
            message: `Upload for mount ${remotePath} did not return stored_path`,
          });
          return;
        }
        fileMountsObj[remotePath] = json.stored_path;
      } catch (err) {
        console.error(err);
        addNotification({
          type: 'danger',
          message: `Failed to upload file for mount ${remotePath}`,
        });
        return;
      }
    }

    onSubmit({
      title,
      cluster_name: clusterName,
      command: commandValue,
      cpus: cpus || undefined,
      memory: memory || undefined,
      disk_space: diskSpace || undefined,
      accelerators: accelerators || undefined,
      num_nodes: numNodes ? parseInt(numNodes, 10) : undefined,
      setup: setupValue,
      env_vars: Object.keys(envVarsObj).length > 0 ? envVarsObj : undefined,
      provider_id: selectedProviderId,
      file_mounts:
        Object.keys(fileMountsObj).length > 0 ? fileMountsObj : undefined,
      github_enabled: githubEnabled || undefined,
      github_repo_url:
        githubEnabled && githubRepoUrl ? githubRepoUrl : undefined,
      github_directory:
        githubEnabled && githubDirectory ? githubDirectory : undefined,
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
    setEnvVars([{ key: '', value: '' }]);
    setFileMounts([
      { remotePath: '', file: null, uploading: false, storedPath: undefined },
    ]);
    setSelectedProviderId(providers[0]?.id || '');
    setGithubEnabled(false);
    setGithubRepoUrl('');
    setGithubDirectory('');
    // clear editor contents if mounted
    try {
      setupEditorRef?.current?.setValue?.('');
      commandEditorRef?.current?.setValue?.('');
    } catch (err) {
      // ignore
    }
    onClose();
  };

  function handleSetupEditorDidMount(editor: any, monaco: any) {
    setupEditorRef.current = editor;
    setTheme(editor, monaco);
  }

  function handleCommandEditorDidMount(editor: any, monaco: any) {
    commandEditorRef.current = editor;
    setTheme(editor, monaco);
  }

  return (
    <Modal open={open} onClose={onClose}>
      <ModalDialog
        sx={{ maxHeight: '90vh', width: '70vw', overflow: 'hidden' }}
      >
        <ModalClose />
        <DialogTitle>New Task</DialogTitle>
        <form onSubmit={handleSubmit}>
          <DialogContent sx={{ maxHeight: '70vh', overflow: 'auto' }}>
            <FormControl required>
              <FormLabel>Title</FormLabel>
              <Input
                value={title}
                onChange={(e) => {
                  setTitle(e.target.value);
                  setClusterName(`${e.target.value}`);
                }}
                placeholder="Task title"
                autoFocus
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
                Choose which provider should launch this task.
              </FormHelperText>
            </FormControl>

            {/* <FormControl required sx={{ mt: 2 }}>
              <FormLabel>Cluster Name</FormLabel>
              <Input
                value={clusterName}
                onChange={(e) => setClusterName(e.target.value)}
                placeholder="Cluster name"
              />
            </FormControl> */}

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
                              uploading: false,
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
                      {
                        remotePath: '',
                        file: null,
                        uploading: false,
                        storedPath: undefined,
                      },
                    ])
                  }
                >
                  Add File Mount
                </Button>
              </Stack>
            </FormControl>

            <FormControl sx={{ mt: 2 }}>
              <FormLabel>GitHub Repository (Optional)</FormLabel>
              <Checkbox
                label="Enable GitHub repository cloning"
                checked={githubEnabled}
                onChange={(e) => setGithubEnabled(e.target.checked)}
                sx={{ mb: githubEnabled ? 2 : 0 }}
              />
              {githubEnabled && (
                <Stack spacing={2} sx={{ mt: 1 }}>
                  <FormControl>
                    <FormLabel>GitHub Repository URL</FormLabel>
                    <Input
                      value={githubRepoUrl}
                      onChange={(e) => setGithubRepoUrl(e.target.value)}
                      placeholder="https://github.com/owner/repo.git"
                    />
                    <FormHelperText>
                      The GitHub repository URL to clone from
                    </FormHelperText>
                  </FormControl>
                  <FormControl>
                    <FormLabel>Directory Path (Optional)</FormLabel>
                    <Input
                      value={githubDirectory}
                      onChange={(e) => setGithubDirectory(e.target.value)}
                      placeholder="path/to/directory"
                    />
                    <FormHelperText>
                      Optional: Specific directory within the repo to clone. If
                      empty, the entire repo will be cloned.
                    </FormHelperText>
                  </FormControl>
                </Stack>
              )}
              <FormHelperText>
                If enabled, the repository will be cloned during setup. A GitHub
                PAT (Personal Access Token) will be used for private
                repositories.
              </FormHelperText>
            </FormControl>

            <FormControl required sx={{ mt: 2, mb: 2 }}>
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
              disabled={isSubmitting}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              variant="solid"
              loading={isSubmitting}
              disabled={isSubmitting || providers.length === 0}
            >
              Create Task
            </Button>
          </DialogActions>
        </form>
      </ModalDialog>
    </Modal>
  );
}
