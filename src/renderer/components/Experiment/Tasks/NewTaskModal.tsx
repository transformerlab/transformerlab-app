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
  Radio,
  RadioGroup,
  Typography,
  Divider,
  CircularProgress,
} from '@mui/joy';
import { Editor } from '@monaco-editor/react';
import fairyflossTheme from '../../Shared/fairyfloss.tmTheme.js';
import {
  Trash2Icon,
  PlusIcon,
  ArrowLeftIcon,
  ArrowRightIcon,
} from 'lucide-react';

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

type TaskMode = 'github-with-json' | 'github-manual' | 'no-github';

type Phase = 'github-selection' | 'task-config' | 'provider-env';

// Helper function to fetch task.json from GitHub via backend API
async function fetchTaskJsonFromGitHub(
  repoUrl: string,
  directory?: string,
): Promise<any | null> {
  try {
    const url = chatAPI.Endpoints.Tasks.FetchTaskJson(
      repoUrl,
      directory || undefined,
    );
    const response = await chatAPI.authenticatedFetch(url, {
      method: 'GET',
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(
        'Error fetching task.json from GitHub:',
        response.status,
        errorText,
      );
      return null;
    }

    const result = await response.json();
    if (result.status === 'success' && result.data) {
      return result.data;
    }

    return null;
  } catch (error) {
    console.error('Error fetching task.json from GitHub:', error);
    return null;
  }
}

export default function NewTaskModal({
  open,
  onClose,
  onSubmit,
  isSubmitting = false,
  providers,
  isProvidersLoading = false,
}: NewTaskModalProps) {
  const { addNotification } = useNotification();

  // Phase management
  const [currentPhase, setCurrentPhase] = useState<Phase>('github-selection');
  const [taskMode, setTaskMode] = useState<TaskMode | null>(null);

  // GitHub fields
  const [useGithub, setUseGithub] = useState<boolean | null>(null);
  const [githubRepoUrl, setGithubRepoUrl] = useState('');
  const [githubDirectory, setGithubDirectory] = useState('');
  const [isLoadingTaskJson, setIsLoadingTaskJson] = useState(false);
  const [taskJsonData, setTaskJsonData] = useState<any | null>(null);

  // Task fields
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

  // Editor refs
  const setupEditorRef = useRef<any>(null);
  const commandEditorRef = useRef<any>(null);

  // Reset form when modal opens/closes
  useEffect(() => {
    if (!open) {
      // Reset all state when modal closes
      setCurrentPhase('github-selection');
      setTaskMode(null);
      setUseGithub(null);
      setGithubRepoUrl('');
      setGithubDirectory('');
      setTaskJsonData(null);
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
      try {
        setupEditorRef?.current?.setValue?.('');
        commandEditorRef?.current?.setValue?.('');
      } catch (err) {
        // ignore
      }
    } else {
      // Initialize provider selection when modal opens
      if (providers.length > 0 && !selectedProviderId) {
        setSelectedProviderId(providers[0].id);
      }
    }
  }, [open, providers]);

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

  const loadTaskJsonFromGithub = React.useCallback(() => {
    if (!githubRepoUrl || isLoadingTaskJson) {
      return;
    }
    setIsLoadingTaskJson(true);
    fetchTaskJsonFromGitHub(githubRepoUrl, githubDirectory || undefined)
      .then((data) => {
        if (data) {
          setTaskJsonData(data);
          setTaskMode('github-with-json');
          // Pre-populate fields from task.json
          if (data.title) setTitle(data.title);
          if (data.name) setTitle(data.name);
          if (data.cluster_name) setClusterName(data.cluster_name);
          if (data.command) setCommand(data.command);
          if (data.cpus) setCpus(String(data.cpus));
          if (data.memory) setMemory(String(data.memory));
          if (data.disk_space) setDiskSpace(String(data.disk_space));
          if (data.accelerators) setAccelerators(data.accelerators);
          if (data.num_nodes) setNumNodes(String(data.num_nodes));
          if (data.setup) setSetup(data.setup);
          if (data.env_vars && typeof data.env_vars === 'object') {
            const envVarsArray = Object.entries(data.env_vars).map(
              ([key, value]) => ({
                key,
                value: String(value),
              }),
            );
            setEnvVars(
              envVarsArray.length > 0 ? envVarsArray : [{ key: '', value: '' }],
            );
          }
          addNotification({
            type: 'success',
            message: 'Successfully loaded task.json from GitHub',
          });
        } else {
          setTaskMode('github-manual');
          addNotification({
            type: 'warning',
            message:
              'Could not find or parse task.json. You can still configure manually.',
          });
        }
      })
      .catch((error) => {
        console.error('Error loading task.json:', error);
        setTaskMode('github-manual');
        addNotification({
          type: 'warning',
          message:
            'Could not load task.json. You can still configure manually.',
        });
      })
      .finally(() => {
        setIsLoadingTaskJson(false);
      });
  }, [
    addNotification,
    githubDirectory,
    githubRepoUrl,
    isLoadingTaskJson,
    setTaskMode,
  ]);

  const handleNextPhase = () => {
    if (currentPhase === 'github-selection') {
      if (useGithub === true) {
        if (!githubRepoUrl.trim()) {
          addNotification({
            type: 'warning',
            message: 'Please enter a GitHub repository URL',
          });
          return;
        }
        // Default to manual GitHub mode until/unless task.json is loaded
        setTaskMode('github-manual');
        setCurrentPhase('task-config');
        loadTaskJsonFromGithub();
      } else if (useGithub === false) {
        setTaskMode('no-github');
        setCurrentPhase('task-config');
      }
    } else if (currentPhase === 'task-config') {
      setCurrentPhase('provider-env');
    }
  };

  const handleBackPhase = () => {
    if (currentPhase === 'task-config') {
      setCurrentPhase('github-selection');
      setTaskMode(null);
    } else if (currentPhase === 'provider-env') {
      setCurrentPhase('task-config');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (currentPhase !== 'provider-env') {
      handleNextPhase();
      return;
    }

    // Validation
    if (!title.trim()) {
      addNotification({ type: 'warning', message: 'Title is required' });
      return;
    }

    // read editor values (fallback to state if editor not mounted)
    let setupValue: string | undefined;
    let commandValue: string | undefined;

    try {
      setupValue = setupEditorRef?.current?.getValue?.() || undefined;
      commandValue = commandEditorRef?.current?.getValue?.() || undefined;
    } catch (e) {
      // If editor getValue fails, fall back to state
      console.warn('Failed to get editor values, using state:', e);
    }

    // Fallback to state if editor values are empty
    if (!setupValue && setup) {
      setupValue = setup;
    }
    if (!commandValue && command) {
      commandValue = command;
    }

    // Trim and validate command
    const trimmedCommand = commandValue?.trim();
    if (!trimmedCommand) {
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
      cluster_name: clusterName || title,
      command: trimmedCommand,
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
      github_enabled: useGithub || undefined,
      github_repo_url: useGithub && githubRepoUrl ? githubRepoUrl : undefined,
      github_directory:
        useGithub && githubDirectory ? githubDirectory : undefined,
    });

    // Reset form
    setCurrentPhase('github-selection');
    setTaskMode(null);
    setUseGithub(null);
    setGithubRepoUrl('');
    setGithubDirectory('');
    setTaskJsonData(null);
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
    // Set initial value if setup state exists
    if (setup) {
      try {
        editor.setValue(setup);
      } catch (e) {
        console.warn('Failed to set initial setup value:', e);
      }
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
    // Set initial value if command state exists
    if (command) {
      try {
        editor.setValue(command);
      } catch (e) {
        console.warn('Failed to set initial command value:', e);
      }
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

  // Update editors when setup/command state changes (e.g., from task.json)
  useEffect(() => {
    if (setupEditorRef.current && setup) {
      try {
        setupEditorRef.current.setValue(setup);
      } catch (e) {
        // Editor might not be ready yet
        console.warn('Failed to set setup editor value:', e);
      }
    }
  }, [setup]);

  useEffect(() => {
    if (commandEditorRef.current && command) {
      try {
        commandEditorRef.current.setValue(command);
      } catch (e) {
        // Editor might not be ready yet
        console.warn('Failed to set command editor value:', e);
      }
    }
  }, [command]);

  const renderPhaseContent = () => {
    switch (currentPhase) {
      case 'github-selection':
        return (
          <Stack spacing={3}>
            <Typography level="title-lg">GitHub Repository</Typography>
            <FormHelperText>
              Would you like to specify a GitHub repository and subdirectory
              where your task is located?
            </FormHelperText>
            <RadioGroup
              value={useGithub === null ? '' : useGithub ? 'yes' : 'no'}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                const value = e.target.value;
                setUseGithub(value === 'yes');
                if (value === 'yes') {
                  // Clear previous GitHub data
                  setGithubRepoUrl('');
                  setGithubDirectory('');
                }
              }}
            >
              <Radio value="yes" label="Yes, use a GitHub repository" />
              <Radio value="no" label="No, I'll provide files manually" />
            </RadioGroup>
            {useGithub === true && (
              <Stack spacing={2} sx={{ mt: 2 }}>
                <FormControl required>
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
                    Optional: Specific directory within the repo. If empty, the
                    entire repo will be cloned.
                  </FormHelperText>
                </FormControl>
              </Stack>
            )}
          </Stack>
        );

      case 'task-json-selection':
        return null;

      case 'task-config':
        return (
          <Stack spacing={3}>
            <Typography level="title-lg">Task Configuration</Typography>
            {useGithub && isLoadingTaskJson && (
              <Stack
                direction="row"
                spacing={2}
                alignItems="center"
                sx={{ mt: 1 }}
              >
                <CircularProgress size="sm" />
                <Typography level="body-sm">
                  Loading task.json from GitHub...
                </Typography>
              </Stack>
            )}
            {taskMode === 'github-with-json' && (
              <FormHelperText>
                Configuration loaded from task.json. You can review and modify
                these fields if needed.
              </FormHelperText>
            )}
            {taskMode === 'github-manual' && (
              <FormHelperText>
                Configure your task settings. The GitHub repository will be
                cloned during setup.
              </FormHelperText>
            )}
            {taskMode === 'no-github' && (
              <FormHelperText>
                Configure your task settings and upload any required files.
              </FormHelperText>
            )}

            <FormControl required>
              <FormLabel>Title</FormLabel>
              <Input
                value={title}
                onChange={(e) => {
                  setTitle(e.target.value);
                  setClusterName(e.target.value || '');
                }}
                placeholder="Task title"
                autoFocus
              />
            </FormControl>

            <div
              style={{
                display: 'flex',
                flexWrap: 'wrap',
                gap: '16px',
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

            <FormControl>
              <FormLabel>Accelerators per Node</FormLabel>
              <Input
                value={accelerators}
                onChange={(e) => setAccelerators(e.target.value)}
                placeholder="e.g. RTX3090:1 or H100:8"
              />
            </FormControl>

            <FormControl>
              <FormLabel>Number of Nodes</FormLabel>
              <Input
                type="number"
                value={numNodes}
                onChange={(e) => setNumNodes(e.target.value)}
                placeholder="e.g. 1"
              />
            </FormControl>

            <FormControl>
              <FormLabel>Setup Command</FormLabel>
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

            <FormControl required>
              <FormLabel>Command</FormLabel>
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

            {taskMode === 'no-github' && (
              <FormControl>
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
            )}
          </Stack>
        );

      case 'provider-env':
        return (
          <Stack spacing={3}>
            <Typography level="title-lg">Provider & Environment</Typography>
            <FormHelperText>
              Select the compute provider and configure environment variables.
            </FormHelperText>

            <FormControl required>
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

            <FormControl>
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
                {taskMode === 'github-with-json' && taskJsonData?.env_vars
                  ? 'Environment variables from task.json are shown above. You can edit them or add additional variables. All will be merged together.'
                  : 'Optional environment variables to set when launching the cluster'}
              </FormHelperText>
            </FormControl>
          </Stack>
        );

      default:
        return null;
    }
  };

  const getPhaseTitle = () => {
    switch (currentPhase) {
      case 'github-selection':
        return 'Step 1: GitHub Repository';
      case 'task-config':
        return 'Step 2: Task Configuration';
      case 'provider-env':
        return 'Step 3: Provider & Environment';
      default:
        return 'New Task';
    }
  };

  const canGoNext = () => {
    if (currentPhase === 'github-selection') {
      if (useGithub === null) return false;
      if (useGithub === true && !githubRepoUrl.trim()) return false;
      return true;
    }
    if (currentPhase === 'task-config') {
      return title.trim().length > 0;
    }
    if (currentPhase === 'provider-env') {
      return selectedProviderId.length > 0;
    }
    return true;
  };

  return (
    <Modal open={open} onClose={onClose}>
      <ModalDialog
        sx={{ maxHeight: '90vh', width: '70vw', overflow: 'hidden' }}
      >
        <ModalClose />
        <DialogTitle>{getPhaseTitle()}</DialogTitle>
        <form onSubmit={handleSubmit}>
          <DialogContent sx={{ maxHeight: '70vh', overflow: 'auto' }}>
            {renderPhaseContent()}
          </DialogContent>
          <Divider />
          <DialogActions>
            <Stack
              direction="row"
              spacing={2}
              sx={{ width: '100%', justifyContent: 'space-between' }}
            >
              <Button
                variant="plain"
                color="neutral"
                onClick={
                  currentPhase === 'github-selection'
                    ? onClose
                    : handleBackPhase
                }
                disabled={isSubmitting}
                startDecorator={<ArrowLeftIcon size={16} />}
              >
                {currentPhase === 'github-selection' ? 'Cancel' : 'Back'}
              </Button>
              <Button
                type="submit"
                variant="solid"
                loading={isSubmitting}
                disabled={
                  isSubmitting ||
                  providers.length === 0 ||
                  !canGoNext() ||
                  (currentPhase === 'provider-env' && isLoadingTaskJson)
                }
                endDecorator={
                  currentPhase !== 'provider-env' ? (
                    <ArrowRightIcon size={16} />
                  ) : null
                }
              >
                {currentPhase === 'provider-env' ? 'Create Task' : 'Next'}
              </Button>
            </Stack>
          </DialogActions>
        </form>
      </ModalDialog>
    </Modal>
  );
}
