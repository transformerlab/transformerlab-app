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
  Typography,
  Divider,
  CircularProgress,
  Switch,
} from '@mui/joy';
import { Editor } from '@monaco-editor/react';
import {
  Trash2Icon,
  PlusIcon,
  ArrowLeftIcon,
  ArrowRightIcon,
} from 'lucide-react';

import { useEffect, useRef, useState } from 'react';
import { useNotification } from 'renderer/components/Shared/NotificationSystem';
import * as chatAPI from 'renderer/lib/transformerlab-api-sdk';
import { setTheme, getMonacoEditorOptions } from 'renderer/lib/monacoConfig';

type ProviderOption = {
  id: string;
  name: string;
};

type NewTaskModalProps = {
  open: boolean;
  onClose: () => void;
  experimentId?: string; // Experiment ID to inject into YAML
  onSubmit: (data: {
    _yamlMode?: boolean; // Flag to indicate YAML was sent directly
    _yamlContent?: string; // YAML content if sent directly
    title: string;
    cluster_name: string;
    command: string;
    cpus?: string;
    memory?: string;
    disk_space?: string;
    accelerators?: string;
    num_nodes?: number;
    minutes_requested?: number;
    setup?: string;
    env_vars?: Record<string, string>;
    provider_id?: string;
    github_repo_url?: string;
    github_directory?: string;
    run_sweeps?: boolean;
    sweep_config?: Record<string, string[]>;
    sweep_metric?: string;
    lower_is_better?: boolean;
  }) => void;
  isSubmitting?: boolean;
  providers: ProviderOption[];
  isProvidersLoading?: boolean;
};

type TaskMode = 'github-with-json' | 'github-manual' | 'no-github';

type Phase = 'task-json-url' | 'task-config' | 'provider-env';

// Helper function to check if URL is a GitHub URL
function isGitHubUrl(url: string): boolean {
  return (
    url.includes('github.com') || url.includes('raw.githubusercontent.com')
  );
}

// Helper function to fetch task.json from any URL
async function fetchTaskJsonFromUrl(
  taskJsonUrl: string,
  experimentId: string,
): Promise<any | null> {
  try {
    // Check if this is a GitHub URL (blob, raw, or repo URL)
    if (isGitHubUrl(taskJsonUrl)) {
      // Use the backend endpoint which supports GitHub PAT and handles URL conversion
      const endpoint = chatAPI.Endpoints.Task.FetchTaskJson(
        experimentId,
        taskJsonUrl,
      );
      const response = await chatAPI.authenticatedFetch(endpoint, {
        method: 'GET',
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error(
          'Error fetching task.json from GitHub. Error: ',
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
    }

    // For non-GitHub URLs, use direct fetch
    // Try using authenticated fetch first (for authenticated endpoints)
    let response = await chatAPI.authenticatedFetch(taskJsonUrl, {
      method: 'GET',
    });

    // If authenticated fetch fails, try regular fetch (for public URLs)
    if (!response.ok) {
      response = await fetch(taskJsonUrl, {
        method: 'GET',
      });
    }

    if (!response.ok) {
      const errorText = await response.text();
      console.error(
        'Error fetching task.json from URL. Error: ',
        response.status,
        errorText,
      );
      return null;
    }

    const jsonData = await response.json();
    return jsonData;
  } catch (error) {
    console.error('Error fetching task.json from URL:', error);
    return null;
  }
}

export default function NewTaskModal({
  open,
  onClose,
  experimentId,
  onSubmit,
  isSubmitting = false,
  providers,
  isProvidersLoading = false,
}: NewTaskModalProps) {
  const { addNotification } = useNotification();

  // Phase management
  const [currentPhase, setCurrentPhase] = useState<Phase>('task-json-url');
  const [taskMode, setTaskMode] = useState<TaskMode | null>(null);

  // Task.json URL field
  const [taskJsonUrl, setTaskJsonUrl] = useState('');
  const [isLoadingTaskJson, setIsLoadingTaskJson] = useState(false);
  const [taskJsonData, setTaskJsonData] = useState<any | null>(null);

  // GitHub fields (extracted from task.json if present)
  const [githubRepoUrl, setGithubRepoUrl] = useState('');
  const [githubDirectory, setGithubDirectory] = useState('');
  const [githubBranch, setGithubBranch] = useState('');

  // Task fields
  const [title, setTitle] = React.useState('');
  const [clusterName, setClusterName] = React.useState('');
  const [command, setCommand] = React.useState('');
  const [cpus, setCpus] = React.useState('');
  const [memory, setMemory] = React.useState('');
  const [diskSpace, setDiskSpace] = React.useState('');
  const [accelerators, setAccelerators] = React.useState('');
  const [numNodes, setNumNodes] = React.useState('');
  const [minutesRequested, setMinutesRequested] = React.useState('60');
  const [setup, setSetup] = React.useState('');
  const [envVars, setEnvVars] = React.useState<
    Array<{ key: string; value: string }>
  >([{ key: '', value: '' }]);
  const [parameters, setParameters] = React.useState<
    Array<{ key: string; value: string; valueType: 'string' | 'json' }>
  >([{ key: '', value: '', valueType: 'string' }]);
  const [selectedProviderId, setSelectedProviderId] = useState('');
  const [enableSweeps, setEnableSweeps] = useState(false);
  const [sweepParams, setSweepParams] = useState<
    Array<{ paramName: string; values: string }>
  >([]);
  const [sweepMetric, setSweepMetric] = useState('eval/loss');
  const [lowerIsBetter, setLowerIsBetter] = useState(true);

  // Editor refs
  const setupEditorRef = useRef<any>(null);
  const commandEditorRef = useRef<any>(null);
  const yamlEditorRef = useRef<any>(null);

  // YAML/GUI mode toggle (default to YAML)
  const [isYamlMode, setIsYamlMode] = useState(true);
  const [yamlContent, setYamlContent] = useState('');

  // Reset form when modal opens/closes
  useEffect(() => {
    if (!open) {
      // Reset all state when modal closes
      setCurrentPhase('task-json-url');
      setTaskMode(null);
      setTaskJsonUrl('');
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
      setMinutesRequested('');
      setSetup('');
      setEnvVars([{ key: '', value: '' }]);
      setParameters([{ key: '', value: '', valueType: 'string' }]);
      setSelectedProviderId(providers[0]?.id || '');
      setEnableSweeps(false);
      setSweepParams([]);
      setSweepMetric('eval/loss');
      setLowerIsBetter(true);
      setIsYamlMode(true);
      setYamlContent(''); // Clear YAML - will be loaded from task.json or template
      try {
        setupEditorRef?.current?.setValue?.('');
        commandEditorRef?.current?.setValue?.('');
        yamlEditorRef?.current?.setValue?.('');
      } catch (err) {
        // ignore
      }
    } else {
      // Initialize provider selection when modal opens
      if (providers.length > 0 && !selectedProviderId) {
        setSelectedProviderId(providers[0].id);
      }
      // Reset YAML content - will be loaded from task.json if available
      setYamlContent('');
    }
  }, [open, providers]);

  // Load YAML from task.json when it's available, or use template.
  // Important: do NOT overwrite non-empty YAML that the user or GUI
  // has already produced.
  useEffect(() => {
    if (
      open &&
      currentPhase === 'task-config' &&
      isYamlMode &&
      !isLoadingTaskJson
    ) {
      // Only load if YAML content is empty (to avoid overwriting user edits)
      // But allow loading when task.json data becomes available
      if (
        taskJsonData &&
        taskMode === 'github-with-json' &&
        (!yamlContent || yamlContent.trim() === '')
      ) {
        // Convert task.json to YAML format
        const taskToYaml = (task: any): string => {
          const yamlData: any = {
            name: task.name || task.title || 'my-task',
          };

          if (task.resources || task.cpus || task.memory) {
            yamlData.resources = {};
            if (task.resources?.compute_provider) {
              yamlData.resources.compute_provider =
                task.resources.compute_provider;
            }
            if (task.cpus) yamlData.resources.cpus = task.cpus;
            if (task.memory) yamlData.resources.memory = task.memory;
            if (task.disk_space)
              yamlData.resources.disk_space = task.disk_space;
            if (task.accelerators)
              yamlData.resources.accelerators = task.accelerators;
            if (task.num_nodes) yamlData.resources.num_nodes = task.num_nodes;
          }

          if (task.env_vars) yamlData.envs = task.env_vars;
          if (task.setup) yamlData.setup = task.setup;
          if (task.command) yamlData.run = task.command;
          // Include GitHub repo info from task.json or extracted state
          if (githubRepoUrl) {
            yamlData.git_repo = githubRepoUrl;
            if (githubDirectory) {
              yamlData.git_repo_directory = githubDirectory;
            }
          } else if (task.github_repo_url || task.git_repo) {
            // Fallback to task.json data if available
            yamlData.git_repo = task.github_repo_url || task.git_repo;
            if (task.github_directory || task.git_repo_directory) {
              yamlData.git_repo_directory =
                task.github_directory || task.git_repo_directory;
            }
          }
          if (task.parameters) yamlData.parameters = task.parameters;
          if (task.run_sweeps && task.sweep_config) {
            yamlData.sweeps = {
              sweep_config: task.sweep_config,
              sweep_metric: task.sweep_metric || 'eval/loss',
              lower_is_better:
                task.lower_is_better !== undefined
                  ? task.lower_is_better
                  : true,
            };
          }

          // Convert to YAML string using the helper function
          return convertToYamlString(yamlData);
        };

        const yamlFromTask = taskToYaml(taskJsonData);
        setYamlContent(yamlFromTask);
        // Update editor if mounted - use a longer delay to ensure editor is ready
        setTimeout(() => {
          if (yamlEditorRef.current) {
            try {
              yamlEditorRef.current.setValue(yamlFromTask);
              // Force a layout update
              yamlEditorRef.current.layout();
            } catch (e) {
              console.warn('Error updating YAML editor with task.json:', e);
            }
          }
        }, 200);
      } else if (
        taskMode === 'no-github' &&
        (!yamlContent || yamlContent.trim() === '')
      ) {
        // Use default template if no task.json and YAML is empty
        const defaultYamlData: any = {
          name: 'my-task',
          resources: {
            cpus: 2,
            memory: 4,
          },
          minutes_requested: 60,
          run: 'echo hello',
        };

        // Add GitHub repo info if available (from task.json)
        if (githubRepoUrl) {
          defaultYamlData.git_repo = githubRepoUrl;
          if (githubDirectory) {
            defaultYamlData.git_repo_directory = githubDirectory;
          }
        }

        const defaultYaml = convertToYamlString(defaultYamlData);
        setYamlContent(defaultYaml);
        setTimeout(() => {
          if (yamlEditorRef.current) {
            try {
              yamlEditorRef.current.setValue(defaultYaml);
            } catch (e) {
              // Editor might not be ready
            }
          }
        }, 200);
      }
    }
  }, [
    open,
    currentPhase,
    isYamlMode,
    taskJsonData,
    taskMode,
    isLoadingTaskJson,
    githubRepoUrl,
    githubDirectory,
  ]);

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

  const loadTaskJsonFromUrl = React.useCallback(() => {
    if (!taskJsonUrl || isLoadingTaskJson) {
      return;
    }
    setIsLoadingTaskJson(true);
    // The following is temporary -- we need to fix the underlying issue later after a cleanup
    // eslint-disable-next-line promise/catch-or-return
    fetchTaskJsonFromUrl(taskJsonUrl, experimentId)
      .then((data) => {
        if (data) {
          setTaskJsonData(data);
          setTaskMode('github-with-json');

          // Extract git_repo and git_repo_directory from task.json if present
          if (data.github_repo_url || data.git_repo) {
            setGithubRepoUrl(data.github_repo_url || data.git_repo);
          }
          if (data.github_directory || data.git_repo_directory) {
            setGithubDirectory(
              data.github_directory || data.git_repo_directory,
            );
          }
          if (data.github_branch || data.git_repo_branch || data.git_branch) {
            setGithubBranch(
              data.github_branch || data.git_repo_branch || data.git_branch,
            );
          }

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
          if (data.minutes_requested)
            setMinutesRequested(String(data.minutes_requested));
          if (data.setup) setSetup(data.setup);
          // Process env_parameters into env_vars if present
          if (data.env_parameters && Array.isArray(data.env_parameters)) {
            // Initialize env_vars if not present
            if (!data.env_vars || typeof data.env_vars !== 'object') {
              data.env_vars = {};
            }

            // Process each env_parameter
            data.env_parameters.forEach((param: any) => {
              if (param && typeof param === 'object' && param.env_var) {
                // If value is provided, use it; otherwise use blank string
                const value =
                  param.value !== undefined ? String(param.value) : '';
                data.env_vars[param.env_var] = value;
              }
            });
          }

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
          if (data.parameters && typeof data.parameters === 'object') {
            const parametersArray = Object.entries(data.parameters).map(
              ([key, value]) => {
                // Try to determine if value is JSON or string
                let valueStr = '';
                let valueType: 'string' | 'json' = 'string';
                if (typeof value === 'object') {
                  valueStr = JSON.stringify(value, null, 2);
                  valueType = 'json';
                } else {
                  valueStr = String(value);
                }
                return { key, value: valueStr, valueType };
              },
            );
            setParameters(
              parametersArray.length > 0
                ? parametersArray
                : [{ key: '', value: '', valueType: 'string' }],
            );
          }
          addNotification({
            type: 'success',
            message: 'Successfully loaded task.json from URL',
          });
          return data;
        } else {
          setTaskMode('no-github');
          addNotification({
            type: 'warning',
            message:
              'Could not find or parse task.json. You can still configure manually.',
          });
          return null;
        }
      })
      .catch((error) => {
        console.error('Error loading task.json:', error);
        setTaskMode('no-github');
        addNotification({
          type: 'warning',
          message:
            'Could not load task.json. You can still configure manually.',
        });
      })
      .finally(() => {
        setIsLoadingTaskJson(false);
      });
  }, [addNotification, taskJsonUrl, isLoadingTaskJson]);

  const handleNextPhase = async () => {
    if (currentPhase === 'task-json-url') {
      // If URL is provided, try to load task.json from it
      if (taskJsonUrl.trim()) {
        setCurrentPhase('task-config');
        loadTaskJsonFromUrl();
      } else {
        // No URL provided, proceed with manual configuration
        setTaskMode('no-github');
        setCurrentPhase('task-config');
      }
    } else if (currentPhase === 'task-config') {
      // If in YAML mode, parse YAML first
      if (isYamlMode) {
        await parseYamlToForm();
        // After parsing, switch to GUI mode to show the parsed values
        setIsYamlMode(false);
      } else {
        // Save editor values to state before moving to next phase
        try {
          const setupValue = setupEditorRef?.current?.getValue?.();
          const commandValue = commandEditorRef?.current?.getValue?.();
          if (setupValue !== undefined) {
            setSetup(setupValue);
          }
          if (commandValue !== undefined) {
            setCommand(commandValue);
          }
        } catch (e) {
          // Silently fail if editor not ready
        }
      }
      setCurrentPhase('provider-env');
    }
  };

  const handleBackPhase = () => {
    if (currentPhase === 'task-config') {
      setCurrentPhase('task-json-url');
      setTaskMode(null);
      // Clear task.json data when going back, so it can be reloaded if URL changes
      setTaskJsonData(null);
      // Clear YAML content so it can be reloaded with new URL info
      if (isYamlMode) {
        setYamlContent('');
      }
    } else if (currentPhase === 'provider-env') {
      setCurrentPhase('task-config');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (currentPhase !== 'provider-env') {
      await handleNextPhase();
      return;
    }

    // If we're in YAML mode, parse YAML first and then submit as JSON
    if (isYamlMode) {
      if (!yamlContent.trim()) {
        addNotification({
          type: 'warning',
          message: 'YAML content is required',
        });
        return;
      }

      // Parse YAML to get the task data structure
      await parseYamlToForm();
      // After parsing, the form fields are populated, so continue with normal JSON submission
      // (The parseYamlToForm already sets provider_id via matching)
    }

    // Validation for GUI mode
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

    // Convert parameters array to object, parsing JSON values
    const parametersObj: Record<string, any> = {};
    parameters.forEach(({ key, value, valueType }) => {
      if (key.trim() && value.trim()) {
        try {
          if (valueType === 'json') {
            // Parse JSON value
            parametersObj[key.trim()] = JSON.parse(value);
          } else {
            // Try to parse as number or boolean, otherwise keep as string
            const trimmedValue = value.trim();
            if (trimmedValue === 'true') {
              parametersObj[key.trim()] = true;
            } else if (trimmedValue === 'false') {
              parametersObj[key.trim()] = false;
            } else if (trimmedValue === 'null') {
              parametersObj[key.trim()] = null;
            } else if (!isNaN(Number(trimmedValue)) && trimmedValue !== '') {
              parametersObj[key.trim()] = Number(trimmedValue);
            } else {
              parametersObj[key.trim()] = trimmedValue;
            }
          }
        } catch (e) {
          // If JSON parsing fails, treat as string
          parametersObj[key.trim()] = value.trim();
        }
      }
    });

    // Build sweep_config if sweeps are enabled
    let sweepConfig: Record<string, string[]> | undefined = undefined;
    if (enableSweeps && sweepParams.length > 0) {
      sweepConfig = {};
      sweepParams.forEach((sp) => {
        if (sp.paramName && sp.values) {
          const values = sp.values
            .split(',')
            .map((v) => v.trim())
            .filter((v) => v);
          if (values.length > 0) {
            sweepConfig![sp.paramName] = values;
          }
        }
      });
      // Only set if we have at least one valid parameter
      if (Object.keys(sweepConfig).length === 0) {
        sweepConfig = undefined;
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
      minutes_requested: minutesRequested
        ? parseInt(minutesRequested, 10)
        : undefined,
      setup: setupValue || undefined,
      env_vars: Object.keys(envVarsObj).length > 0 ? envVarsObj : undefined,
      parameters:
        Object.keys(parametersObj).length > 0 ? parametersObj : undefined,
      provider_id: selectedProviderId,
      github_repo_url: githubRepoUrl || undefined,
      github_directory: githubDirectory || undefined,
      github_branch: githubBranch || undefined,
      run_sweeps: enableSweeps && sweepConfig ? true : undefined,
      sweep_config: sweepConfig,
      sweep_metric:
        enableSweeps && sweepConfig ? sweepMetric || 'eval/loss' : undefined,
      lower_is_better: enableSweeps && sweepConfig ? lowerIsBetter : undefined,
    });

    // Reset form
    setCurrentPhase('task-json-url');
    setTaskMode(null);
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
    setMinutesRequested('');
    setSetup('');
    setEnvVars([{ key: '', value: '' }]);
    setParameters([{ key: '', value: '', valueType: 'string' }]);
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

    // Prevent browser extension interference - try multiple times with delays
    // Monaco Editor's textarea might not exist immediately
    const applyAttributes = () => {
      try {
        const domNode = editor.getDomNode();
        if (domNode) {
          domNode.setAttribute('autocomplete', 'off');
          domNode.setAttribute('data-form-type', 'other');
          domNode.setAttribute('data-lpignore', 'true');
          domNode.setAttribute('data-1p-ignore', 'true');

          // Find the textarea element that Monaco creates and add attributes
          const textarea = domNode.querySelector('textarea');
          if (textarea) {
            textarea.setAttribute('autocomplete', 'off');
            textarea.setAttribute('data-form-type', 'other');
            textarea.setAttribute('data-lpignore', 'true');
            textarea.setAttribute('data-1p-ignore', 'true');
            textarea.setAttribute('data-bwignore', 'true');
            textarea.setAttribute('data-dashlane-ignore', 'true');
            textarea.setAttribute('data-lastpass-icon-root', 'true');
            return true; // Success
          }
        }
      } catch (e) {
        // Silently fail if DOM manipulation isn't possible
      }
      return false; // Not ready yet
    };

    // Try immediately
    if (!applyAttributes()) {
      // If not ready, try again after delays
      setTimeout(() => {
        if (!applyAttributes()) {
          setTimeout(() => applyAttributes(), 200);
        }
      }, 50);
    }

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

    // Prevent browser extension interference - try multiple times with delays
    // Monaco Editor's textarea might not exist immediately
    const applyAttributes = () => {
      try {
        const domNode = editor.getDomNode();
        if (domNode) {
          domNode.setAttribute('autocomplete', 'off');
          domNode.setAttribute('data-form-type', 'other');
          domNode.setAttribute('data-lpignore', 'true');
          domNode.setAttribute('data-1p-ignore', 'true');

          // Find the textarea element that Monaco creates and add attributes
          const textarea = domNode.querySelector('textarea');
          if (textarea) {
            textarea.setAttribute('autocomplete', 'off');
            textarea.setAttribute('data-form-type', 'other');
            textarea.setAttribute('data-lpignore', 'true');
            textarea.setAttribute('data-1p-ignore', 'true');
            textarea.setAttribute('data-bwignore', 'true');
            textarea.setAttribute('data-dashlane-ignore', 'true');
            textarea.setAttribute('data-lastpass-icon-root', 'true');
            return true; // Success
          }
        }
      } catch (e) {
        // Silently fail if DOM manipulation isn't possible
      }
      return false; // Not ready yet
    };

    // Try immediately
    if (!applyAttributes()) {
      // If not ready, try again after delays
      setTimeout(() => {
        if (!applyAttributes()) {
          setTimeout(() => applyAttributes(), 200);
        }
      }, 50);
    }

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

  // Simple YAML string converter
  const convertToYamlString = (obj: any, indent = 0): string => {
    const indentStr = '  '.repeat(indent);
    let result = '';

    for (const [key, value] of Object.entries(obj)) {
      if (
        value === null ||
        value === undefined ||
        (typeof value === 'object' && Object.keys(value).length === 0)
      )
        continue;

      if (typeof value === 'object' && !Array.isArray(value)) {
        result += `${indentStr}${key}:\n${convertToYamlString(value, indent + 1)}`;
      } else if (Array.isArray(value)) {
        result += `${indentStr}${key}:\n`;
        value.forEach((item) => {
          if (typeof item === 'object') {
            result += `${indentStr}  -\n${convertToYamlString(item, indent + 2)}`;
          } else {
            result += `${indentStr}  - ${item}\n`;
          }
        });
      } else if (typeof value === 'string' && value.includes('\n')) {
        result += `${indentStr}${key}: |\n${value
          .split('\n')
          .map((line: string) => `${indentStr}  ${line}`)
          .join('\n')}\n`;
      } else if (
        typeof value === 'string' &&
        (value.startsWith('"') || value.includes(':'))
      ) {
        result += `${indentStr}${key}: "${value.replace(/"/g, '\\"')}"\n`;
      } else {
        result += `${indentStr}${key}: ${value}\n`;
      }
    }

    return result;
  };

  // Convert form data to YAML
  const convertFormToYaml = () => {
    const yamlData: any = {
      name: title || 'untitled-task',
    };

    // Resources
    if (
      selectedProviderId ||
      cpus ||
      memory ||
      diskSpace ||
      accelerators ||
      numNodes
    ) {
      yamlData.resources = {};
      if (selectedProviderId) {
        const provider = providers.find((p) => p.id === selectedProviderId);
        if (provider) {
          yamlData.resources.compute_provider = provider.name;
        }
      }
      if (cpus) yamlData.resources.cpus = parseInt(cpus) || cpus;
      if (memory) yamlData.resources.memory = parseInt(memory) || memory;
      if (diskSpace)
        yamlData.resources.disk_space = parseInt(diskSpace) || diskSpace;
      if (accelerators) yamlData.resources.accelerators = accelerators;
      if (numNodes)
        yamlData.resources.num_nodes = parseInt(numNodes) || numNodes;
    }

    // Environment variables
    const envs: Record<string, string> = {};
    envVars.forEach(({ key, value }) => {
      if (key.trim() && value.trim()) {
        envs[key.trim()] = value.trim();
      }
    });
    if (Object.keys(envs).length > 0) {
      yamlData.envs = envs;
    }

    // Minutes requested (task-level field)
    if (minutesRequested) {
      yamlData.minutes_requested =
        parseInt(minutesRequested, 10) || minutesRequested;
    }

    // Setup and run
    const setupValue = setupEditorRef?.current?.getValue?.() || setup;
    if (setupValue) yamlData.setup = setupValue;
    const commandValue = commandEditorRef?.current?.getValue?.() || command;
    if (commandValue) yamlData.run = commandValue;

    // GitHub - include if available (extracted from task.json or manually set)
    if (githubRepoUrl) {
      yamlData.git_repo = githubRepoUrl;
      if (githubDirectory) {
        yamlData.git_repo_directory = githubDirectory;
      }
      if (githubBranch) {
        yamlData.git_repo_branch = githubBranch;
      }
    }

    // Parameters
    const parametersObj: Record<string, any> = {};
    parameters.forEach(({ key, value, valueType }) => {
      if (key.trim()) {
        if (valueType === 'json') {
          try {
            parametersObj[key.trim()] = JSON.parse(value);
          } catch {
            parametersObj[key.trim()] = value;
          }
        } else {
          parametersObj[key.trim()] = value;
        }
      }
    });
    if (Object.keys(parametersObj).length > 0) {
      yamlData.parameters = parametersObj;
    }

    // Sweeps
    if (enableSweeps && sweepParams.length > 0) {
      const sweepConfig: Record<string, string[]> = {};
      sweepParams.forEach(({ paramName, values }) => {
        if (paramName.trim() && values.trim()) {
          sweepConfig[paramName.trim()] = values
            .split(',')
            .map((v) => v.trim())
            .filter(Boolean);
        }
      });
      if (Object.keys(sweepConfig).length > 0) {
        yamlData.sweeps = {
          sweep_config: sweepConfig,
          sweep_metric: sweepMetric || 'eval/loss',
          lower_is_better: lowerIsBetter,
        };
      }
    }

    // Convert to YAML string (simple manual conversion for now)
    const yamlString = convertToYamlString(yamlData);
    setYamlContent(yamlString);

    // Explicitly update the Monaco editor if it's mounted
    if (yamlEditorRef.current) {
      yamlEditorRef.current.setValue(yamlString);
      // Trigger layout update to ensure proper rendering
      setTimeout(() => {
        yamlEditorRef.current?.layout();
      }, 0);
    }
  };

  // Parse YAML and populate form
  const parseYamlToForm = async () => {
    if (!yamlContent.trim()) {
      addNotification({ type: 'warning', message: 'YAML content is empty' });
      return;
    }

    try {
      // Parse YAML on frontend - call backend /new_task endpoint to validate and get parsed data
      // We'll send it as a test request to get the parsed structure, then use that to populate the form
      // Actually, let's parse it directly using a simple approach that works for our structure
      const parseYaml = (yamlStr: string): any => {
        // Simple YAML parser that supports:
        // - nested maps via indentation
        // - scalar values
        // - basic arrays using "- value" syntax (used for sweeps.sweep_config)
        const lines = yamlStr.split('\n');
        const result: any = {};
        const stack: Array<{
          obj: any;
          level: number;
          parent?: any;
          keyInParent?: string;
        }> = [{ obj: result, level: -1 }];

        const parseScalar = (value: string): any => {
          // Remove quotes
          if (
            (value.startsWith('"') && value.endsWith('"')) ||
            (value.startsWith("'") && value.endsWith("'"))
          ) {
            value = value.slice(1, -1);
          }

          // Try to parse as number or boolean
          if (value === 'true') return true;
          if (value === 'false') return false;
          if (value === 'null') return null;
          if (/^-?\d+$/.test(value)) return parseInt(value, 10);
          if (/^-?\d*\.\d+$/.test(value)) return parseFloat(value);
          return value;
        };

        for (let i = 0; i < lines.length; i++) {
          const line = lines[i];
          const trimmed = line.trim();

          // Skip empty lines and comments
          if (!trimmed || trimmed.startsWith('#')) continue;

          // Calculate indent level (assuming 2 spaces per level)
          const indent = line.length - line.trimStart().length;
          const level = Math.floor(indent / 2);

          // Pop stack until we're at the right level
          while (stack.length > 1 && stack[stack.length - 1].level >= level) {
            stack.pop();
          }

          const top = stack[stack.length - 1];
          const current = top.obj;

          // Handle array item: "- value"
          if (trimmed.startsWith('- ')) {
            let valueStr = trimmed.slice(2).trim();
            const value = parseScalar(valueStr);

            // Ensure current container is an array
            if (!Array.isArray(current)) {
              // Convert the current object into an array attached to its parent
              const newArr: any[] = [];
              if (top.parent && top.keyInParent) {
                top.parent[top.keyInParent] = newArr;
              }
              top.obj = newArr;
            }
            (top.obj as any[]).push(value);
            continue;
          }

          // Check if this is a key-value pair or a nested object
          if (trimmed.endsWith(':')) {
            // Nested object
            const key = trimmed.slice(0, -1).trim();
            const newObj: any = {};
            current[key] = newObj;
            stack.push({
              obj: newObj,
              level,
              parent: current,
              keyInParent: key,
            });
          } else {
            // Key-value pair
            const colonIndex = trimmed.indexOf(':');
            if (colonIndex > 0) {
              const key = trimmed.slice(0, colonIndex).trim();
              let valueStr: any = trimmed.slice(colonIndex + 1).trim();
              const value = parseScalar(valueStr);
              current[key] = value;
            }
          }
        }

        return result;
      };

      const yamlData = parseYaml(yamlContent);

      if (!yamlData) {
        throw new Error('YAML content is empty or invalid');
      }

      // Support both old format (with "task:" key) and new format (direct fields)
      // for backward compatibility
      const taskYaml = yamlData.task || yamlData;
      const taskData: any = {};

      // Basic fields
      if (taskYaml.name) {
        taskData.name = taskYaml.name;
      }

      // Resources
      if (taskYaml.resources) {
        const resources = taskYaml.resources;
        if (resources.compute_provider) {
          taskData.provider_name = resources.compute_provider;
        }
        if (resources.cpus !== undefined) {
          taskData.cpus = String(resources.cpus);
        }
        if (resources.memory !== undefined) {
          taskData.memory = String(resources.memory);
        }
        if (resources.disk_space !== undefined) {
          taskData.disk_space = String(resources.disk_space);
        }
        if (resources.accelerators) {
          taskData.accelerators = resources.accelerators;
        }
        if (resources.num_nodes !== undefined) {
          taskData.num_nodes = resources.num_nodes;
        }
      }
      // Minutes requested (task-level field)
      if (taskYaml.minutes_requested !== undefined) {
        taskData.minutes_requested = taskYaml.minutes_requested;
      }

      // Environment variables
      if (taskYaml.envs) {
        taskData.env_vars = taskYaml.envs;
      }

      // Setup and run commands
      if (taskYaml.setup) {
        taskData.setup = String(taskYaml.setup);
      }
      if (taskYaml.run) {
        taskData.command = String(taskYaml.run);
      }

      // GitHub - support multiple naming conventions
      if (taskYaml.github_repo_url) {
        taskData.github_repo_url = String(taskYaml.github_repo_url);
      } else if (taskYaml.git_repo) {
        taskData.github_repo_url = String(taskYaml.git_repo);
      }
      if (taskYaml.github_repo_dir) {
        taskData.github_directory = String(taskYaml.github_repo_dir);
      } else if (taskYaml.github_repo_directory) {
        taskData.github_directory = String(taskYaml.github_repo_directory);
      } else if (taskYaml.github_directory) {
        taskData.github_directory = String(taskYaml.github_directory);
      } else if (taskYaml.git_repo_directory) {
        taskData.github_directory = String(taskYaml.git_repo_directory);
      }
      if (taskYaml.github_branch) {
        taskData.github_branch = String(taskYaml.github_branch);
      } else if (taskYaml.git_repo_branch) {
        taskData.github_branch = String(taskYaml.git_repo_branch);
      } else if (taskYaml.git_branch) {
        taskData.github_branch = String(taskYaml.git_branch);
      }

      // Parameters
      if (taskYaml.parameters) {
        taskData.parameters = taskYaml.parameters;
      }

      // Sweeps
      if (taskYaml.sweeps) {
        const sweeps = taskYaml.sweeps;
        taskData.run_sweeps = true;
        if (sweeps.sweep_config) {
          taskData.sweep_config = sweeps.sweep_config;
        }
        if (sweeps.sweep_metric) {
          taskData.sweep_metric = String(sweeps.sweep_metric);
        }
        if (sweeps.lower_is_better !== undefined) {
          taskData.lower_is_better = Boolean(sweeps.lower_is_better);
        }
      }

      // Populate form fields
      if (taskData.name) setTitle(taskData.name);
      if (taskData.cluster_name) setClusterName(taskData.cluster_name);
      if (taskData.command) setCommand(taskData.command);
      if (taskData.setup) setSetup(taskData.setup);
      if (taskData.cpus) setCpus(String(taskData.cpus));
      if (taskData.memory) setMemory(String(taskData.memory));
      if (taskData.disk_space) setDiskSpace(String(taskData.disk_space));
      if (taskData.accelerators) setAccelerators(taskData.accelerators);
      if (taskData.num_nodes) setNumNodes(String(taskData.num_nodes));
      if (taskData.minutes_requested)
        setMinutesRequested(String(taskData.minutes_requested));
      if (taskData.github_repo_url) setGithubRepoUrl(taskData.github_repo_url);
      if (taskData.github_directory)
        setGithubDirectory(taskData.github_directory);
      if (taskData.github_branch) setGithubBranch(taskData.github_branch);

      // Environment variables
      if (taskData.env_vars && typeof taskData.env_vars === 'object') {
        const envVarsArray = Object.entries(taskData.env_vars).map(
          ([key, value]) => ({
            key,
            value: String(value),
          }),
        );
        setEnvVars(
          envVarsArray.length > 0 ? envVarsArray : [{ key: '', value: '' }],
        );
      }

      // Parameters
      if (taskData.parameters && typeof taskData.parameters === 'object') {
        const parametersArray = Object.entries(taskData.parameters).map(
          ([key, value]) => {
            let valueStr = '';
            let valueType: 'string' | 'json' = 'string';
            if (typeof value === 'object') {
              valueStr = JSON.stringify(value, null, 2);
              valueType = 'json';
            } else {
              valueStr = String(value);
            }
            return { key, value: valueStr, valueType };
          },
        );
        setParameters(
          parametersArray.length > 0
            ? parametersArray
            : [{ key: '', value: '', valueType: 'string' }],
        );
      }

      // Provider - match by name and set provider_id (case-insensitive)
      if (taskData.provider_name) {
        const providerNameLower = taskData.provider_name.toLowerCase().trim();
        const provider = providers.find(
          (p) => p.name.toLowerCase().trim() === providerNameLower,
        );
        if (provider) {
          setSelectedProviderId(provider.id);
        } else {
          addNotification({
            type: 'warning',
            message: `Provider "${taskData.provider_name}" not found. Please select a provider manually.`,
          });
        }
      }

      // Sweeps
      if (taskData.run_sweeps) {
        setEnableSweeps(true);
        if (taskData.sweep_config) {
          const sweepParamsArray = Object.entries(taskData.sweep_config).map(
            ([paramName, values]) => ({
              paramName,
              values: Array.isArray(values)
                ? values.join(', ')
                : String(values),
            }),
          );
          setSweepParams(sweepParamsArray);
        }
        if (taskData.sweep_metric) setSweepMetric(taskData.sweep_metric);
        if (taskData.lower_is_better !== undefined)
          setLowerIsBetter(taskData.lower_is_better);
      }

      addNotification({ type: 'success', message: 'YAML parsed successfully' });
    } catch (error: any) {
      console.error('Error parsing YAML:', error);
      addNotification({
        type: 'danger',
        message:
          error.message || 'Failed to parse YAML. Please check the format.',
      });
    }
  };

  const renderPhaseContent = () => {
    switch (currentPhase) {
      case 'task-json-url':
        return (
          <Stack spacing={3}>
            <FormControl>
              <FormLabel>Task.json URL (Optional)</FormLabel>
              <Input
                value={taskJsonUrl}
                onChange={(e) => {
                  const newUrl = e.target.value;
                  setTaskJsonUrl(newUrl);
                  // Clear task.json data when URL changes so it can be reloaded
                  setTaskJsonData(null);
                  setTaskMode(null);
                  // Clear YAML if in YAML mode so it can reload
                  if (isYamlMode) {
                    setYamlContent('');
                  }
                }}
                placeholder="https://raw.githubusercontent.com/owner/repo/branch/path/task.json"
                disabled={isLoadingTaskJson}
              />
              <FormHelperText>
                Leave blank to create a task from scratch
              </FormHelperText>
            </FormControl>
            {isLoadingTaskJson && (
              <Stack direction="row" spacing={2} alignItems="center">
                <CircularProgress size="sm" />
                <Typography level="body-sm">
                  Loading task.json from URL...
                </Typography>
              </Stack>
            )}
          </Stack>
        );

      case 'task-config':
        return (
          <Stack spacing={3}>
            <Stack
              direction="row"
              spacing={2}
              alignItems="center"
              justifyContent="space-between"
            >
              <Typography level="title-lg">Task Configuration</Typography>
              <Stack direction="row" spacing={1} alignItems="center">
                <Typography level="body-sm">GUI</Typography>
                <Switch
                  checked={isYamlMode}
                  onChange={(e) => {
                    const newMode = e.target.checked;
                    setIsYamlMode(newMode);
                    if (newMode) {
                      // Switching to YAML mode - convert form data to YAML.
                      // Use a microtask to ensure any in-flight state updates
                      // from the last GUI edits have been applied.
                      setTimeout(() => {
                        convertFormToYaml();
                      }, 0);
                    } else {
                      // Switching to GUI mode - parse YAML and populate form
                      parseYamlToForm();
                    }
                  }}
                />
                <Typography level="body-sm">YAML</Typography>
              </Stack>
            </Stack>

            {isYamlMode ? (
              <FormControl>
                <FormLabel>Task YAML Configuration</FormLabel>
                {isLoadingTaskJson ? (
                  <Stack
                    direction="row"
                    spacing={2}
                    alignItems="center"
                    justifyContent="center"
                    sx={{
                      height: '500px',
                      border: '1px solid var(--joy-palette-neutral-300)',
                      borderRadius: '8px',
                      bgcolor: 'background.level1',
                    }}
                  >
                    <CircularProgress size="sm" />
                    <Typography level="body-sm">
                      Loading task.json from URL...
                    </Typography>
                  </Stack>
                ) : (
                  <div
                    style={{
                      height: '500px',
                      border: '1px solid var(--joy-palette-neutral-300)',
                      borderRadius: '8px',
                    }}
                  >
                    <Editor
                      height="100%"
                      defaultLanguage="yaml"
                      value={yamlContent}
                      onChange={(value) => setYamlContent(value || '')}
                      onMount={(editor, monaco) => {
                        try {
                          yamlEditorRef.current = editor;
                          setTheme(editor, monaco);
                          // Set initial value if empty
                          if (!yamlContent || yamlContent.trim() === '') {
                            const defaultYaml =
                              'name: my-task\nresources:\n  cpus: 2\n  memory: 4\nrun: "echo hello"';
                            editor.setValue(defaultYaml);
                            setYamlContent(defaultYaml);
                          } else {
                            // Ensure editor has the current content
                            editor.setValue(yamlContent);
                          }
                        } catch (error) {
                          console.error('Error setting up YAML editor:', error);
                        }
                      }}
                      theme="my-theme"
                      options={getMonacoEditorOptions({
                        readOnly: isLoadingTaskJson, // Disable editing while loading
                      })}
                    />
                  </div>
                )}
                <FormHelperText>
                  {isLoadingTaskJson
                    ? 'Loading task configuration from URL...'
                    : 'Define your task configuration in YAML format. See documentation for structure.'}
                </FormHelperText>
              </FormControl>
            ) : (
              <>
                {isLoadingTaskJson && (
                  <Stack
                    direction="row"
                    spacing={2}
                    alignItems="center"
                    sx={{ mt: 1 }}
                  >
                    <CircularProgress size="sm" />
                    <Typography level="body-sm">
                      Loading task.json from URL...
                    </Typography>
                  </Stack>
                )}
                {taskMode === 'github-with-json' && (
                  <FormHelperText>
                    Configuration loaded from task.json. You can review and
                    modify these fields if needed.
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
                  <FormLabel>Minutes Requested (for quota tracking)</FormLabel>
                  <Input
                    type="number"
                    value={minutesRequested}
                    onChange={(e) => setMinutesRequested(e.target.value)}
                    placeholder="e.g. 60"
                  />
                  <FormHelperText>
                    Estimated minutes this task will run. Used for quota
                    tracking.
                  </FormHelperText>
                </FormControl>

                <FormControl>
                  <FormLabel>Setup Command</FormLabel>
                  <div
                    data-form-type="other"
                    data-lpignore="true"
                    data-1p-ignore="true"
                    style={{ position: 'relative' }}
                  >
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
                  </div>
                  <FormHelperText>
                    e.g. <code>pip install -r requirements.txt</code>
                  </FormHelperText>
                </FormControl>

                <FormControl>
                  <FormLabel>GitHub Repository URL (Optional)</FormLabel>
                  <Input
                    value={githubRepoUrl}
                    onChange={(e) => setGithubRepoUrl(e.target.value)}
                    placeholder="https://github.com/owner/repo.git"
                  />
                  <FormHelperText>
                    GitHub repository URL to clone before running the task
                  </FormHelperText>
                </FormControl>

                {githubRepoUrl && (
                  <FormControl>
                    <FormLabel>
                      GitHub Repository Directory (Optional)
                    </FormLabel>
                    <Input
                      value={githubDirectory}
                      onChange={(e) => setGithubDirectory(e.target.value)}
                      placeholder="path/to/directory"
                    />
                    <FormHelperText>
                      Optional subdirectory path within the repository
                    </FormHelperText>
                  </FormControl>
                )}

                {githubRepoUrl && (
                  <FormControl>
                    <FormLabel>GitHub Branch (Optional)</FormLabel>
                    <Input
                      value={githubBranch}
                      onChange={(e) => setGithubBranch(e.target.value)}
                      placeholder="main"
                    />
                    <FormHelperText>
                      Optional branch, tag, or commit SHA. Defaults to default
                      branch if not specified.
                    </FormHelperText>
                  </FormControl>
                )}

                <FormControl required>
                  <FormLabel>Command</FormLabel>
                  <div
                    data-form-type="other"
                    data-lpignore="true"
                    data-1p-ignore="true"
                    style={{ position: 'relative' }}
                  >
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
                  </div>
                  <FormHelperText>
                    e.g. <code>python train.py --epochs 10</code>
                  </FormHelperText>
                </FormControl>

                <FormControl sx={{ mt: 2 }}>
                  <FormLabel>Parameters</FormLabel>
                  <Stack spacing={1}>
                    {parameters.map((param, index) => (
                      <Stack key={index} spacing={1}>
                        <Stack direction="row" spacing={1} alignItems="center">
                          <Input
                            placeholder="Parameter name (e.g., learning_rate)"
                            value={param.key}
                            onChange={(e) => {
                              const newParams = [...parameters];
                              newParams[index].key = e.target.value;

                              // If user is typing in the last row and it's becoming non-empty,
                              // automatically append a new blank row so they don't need to click "Add".
                              const isLast = index === newParams.length - 1;
                              const hasContent =
                                newParams[index].key.trim() ||
                                newParams[index].value.trim();
                              if (isLast && hasContent) {
                                newParams.push({
                                  key: '',
                                  value: '',
                                  valueType: 'string',
                                });
                              }
                              setParameters(newParams);
                            }}
                            sx={{ flex: 1 }}
                          />
                          <Select
                            value={param.valueType}
                            onChange={(_, newValue) => {
                              if (newValue) {
                                const newParams = [...parameters];
                                newParams[index].valueType = newValue;
                                setParameters(newParams);
                              }
                            }}
                            sx={{ minWidth: 100 }}
                          >
                            <Option value="string">String</Option>
                            <Option value="json">JSON</Option>
                          </Select>
                          <IconButton
                            color="danger"
                            variant="plain"
                            onClick={() => {
                              if (parameters.length > 1) {
                                setParameters(
                                  parameters.filter((_, i) => i !== index),
                                );
                              } else {
                                setParameters([
                                  { key: '', value: '', valueType: 'string' },
                                ]);
                              }
                            }}
                          >
                            <Trash2Icon size={16} />
                          </IconButton>
                        </Stack>
                        {param.valueType === 'json' ? (
                          <Editor
                            height="120px"
                            defaultLanguage="json"
                            value={param.value}
                            onChange={(value) => {
                              const newParams = [...parameters];
                              newParams[index].value = value || '';
                              setParameters(newParams);
                            }}
                            theme="my-theme"
                            onMount={setTheme}
                            options={{
                              minimap: { enabled: false },
                              scrollBeyondLastLine: false,
                              fontSize: 12,
                              lineNumbers: 'off',
                              wordWrap: 'on',
                            }}
                          />
                        ) : (
                          <Input
                            placeholder="Value (e.g., 0.001, true, false, or any string)"
                            value={param.value}
                            onChange={(e) => {
                              const newParams = [...parameters];
                              newParams[index].value = e.target.value;

                              // Same auto-append behavior when editing value.
                              const isLast = index === newParams.length - 1;
                              const hasContent =
                                newParams[index].key.trim() ||
                                newParams[index].value.trim();
                              if (isLast && hasContent) {
                                newParams.push({
                                  key: '',
                                  value: '',
                                  valueType: 'string',
                                });
                              }
                              setParameters(newParams);
                            }}
                          />
                        )}
                      </Stack>
                    ))}
                    <Button
                      variant="outlined"
                      size="sm"
                      startDecorator={<PlusIcon size={16} />}
                      onClick={() =>
                        setParameters([
                          ...parameters,
                          { key: '', value: '', valueType: 'string' },
                        ])
                      }
                    >
                      Add Parameter
                    </Button>
                  </Stack>
                  <FormHelperText>
                    {taskMode === 'github-with-json' && taskJsonData?.parameters
                      ? 'Parameters from task.json are shown above. You can edit them or add additional parameters. All will be merged together.'
                      : 'Task parameters accessible via lab.get_config() in your script. Use JSON type for complex objects.'}
                  </FormHelperText>
                </FormControl>

                <Divider sx={{ my: 2 }} />

                <FormControl>
                  <Stack spacing={2}>
                    <Stack
                      direction="row"
                      justifyContent="space-between"
                      alignItems="center"
                    >
                      <FormLabel>Enable Parameter Sweeps</FormLabel>
                      <Switch
                        checked={enableSweeps}
                        onChange={(e) => setEnableSweeps(e.target.checked)}
                      />
                    </Stack>
                    {enableSweeps && (
                      <Stack spacing={2}>
                        <FormHelperText>
                          Define parameters to sweep. Each parameter will be
                          tried with all specified values. All combinations will
                          be created.
                        </FormHelperText>

                        {sweepParams.map((sp, index) => (
                          <Stack direction="row" spacing={1} key={index}>
                            <Input
                              placeholder="Parameter name (e.g., learning_rate)"
                              value={sp.paramName}
                              onChange={(e) => {
                                const newSweepParams = [...sweepParams];
                                newSweepParams[index].paramName =
                                  e.target.value;
                                setSweepParams(newSweepParams);
                              }}
                              sx={{ flex: 1 }}
                            />
                            <Input
                              placeholder="Values (comma-separated, e.g., 1e-5,3e-5,5e-5)"
                              value={sp.values}
                              onChange={(e) => {
                                const newSweepParams = [...sweepParams];
                                newSweepParams[index].values = e.target.value;
                                setSweepParams(newSweepParams);
                              }}
                              sx={{ flex: 1 }}
                            />
                            <IconButton
                              color="danger"
                              variant="plain"
                              onClick={() => {
                                if (sweepParams.length > 1) {
                                  setSweepParams(
                                    sweepParams.filter((_, i) => i !== index),
                                  );
                                } else {
                                  setSweepParams([]);
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
                            setSweepParams([
                              ...sweepParams,
                              { paramName: '', values: '' },
                            ])
                          }
                        >
                          Add Sweep Parameter
                        </Button>

                        {sweepParams.length > 0 && (
                          <FormHelperText>
                            This will create{' '}
                            {sweepParams.reduce(
                              (acc, sp) =>
                                acc *
                                (sp.values
                                  ? sp.values.split(',').filter((v) => v.trim())
                                      .length
                                  : 0),
                              1,
                            )}{' '}
                            job(s) (one for each combination)
                          </FormHelperText>
                        )}

                        <FormControl>
                          <FormLabel>Optimization Metric</FormLabel>
                          <Input
                            placeholder="eval/loss"
                            value={sweepMetric}
                            onChange={(e) => setSweepMetric(e.target.value)}
                          />
                          <FormHelperText>
                            Metric name to optimize (e.g., eval/loss, accuracy,
                            f1_score). Used to determine the best configuration.
                          </FormHelperText>
                        </FormControl>

                        <FormControl>
                          <FormLabel>Optimization Direction</FormLabel>
                          <Select
                            value={lowerIsBetter ? 'lower' : 'higher'}
                            onChange={(_, newValue) =>
                              setLowerIsBetter(newValue === 'lower')
                            }
                          >
                            <Option value="lower">
                              Lower is better (e.g., loss)
                            </Option>
                            <Option value="higher">
                              Higher is better (e.g., accuracy)
                            </Option>
                          </Select>
                          <FormHelperText>
                            Whether to minimize or maximize the metric value.
                          </FormHelperText>
                        </FormControl>
                      </Stack>
                    )}
                  </Stack>
                </FormControl>
              </>
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
      case 'task-json-url':
        return 'Step 1: Task Configuration URL';
      case 'task-config':
        return 'Step 2: Task Configuration';
      case 'provider-env':
        return 'Step 3: Provider & Environment';
      default:
        return 'New Task';
    }
  };

  const canGoNext = () => {
    if (currentPhase === 'task-json-url') {
      // Always allow proceeding (URL is optional)
      return true;
    }
    if (currentPhase === 'task-config') {
      // In YAML mode, check if YAML content is not empty
      if (isYamlMode) {
        return yamlContent.trim().length > 0;
      }
      // In GUI mode, check if title is filled
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
          <DialogActions>
            <Stack
              direction="row"
              spacing={2}
              sx={{ width: '100%', justifyContent: 'space-between' }}
            >
              {currentPhase === 'task-json-url' ? (
                <Button
                  variant="plain"
                  color="warning"
                  onClick={onClose}
                  disabled={isSubmitting}
                >
                  Cancel
                </Button>
              ) : (
                <Button
                  variant="plain"
                  color="neutral"
                  onClick={handleBackPhase}
                  disabled={isSubmitting}
                  startDecorator={<ArrowLeftIcon size={16} />}
                >
                  Back
                </Button>
              )}
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
