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
  Switch,
  Typography,
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
  const [minutesRequested, setMinutesRequested] = React.useState('');
  const [setup, setSetup] = React.useState('');
  const [envVars, setEnvVars] = React.useState<
    Array<{ key: string; value: string }>
  >([{ key: '', value: '' }]);
  const [parameters, setParameters] = React.useState<
    Array<{ key: string; value: string; valueType: 'string' | 'json' }>
  >([{ key: '', value: '', valueType: 'string' }]);
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
  const [enableSweeps, setEnableSweeps] = React.useState(false);
  const [sweepParams, setSweepParams] = React.useState<
    Array<{ paramName: string; values: string }>
  >([]);
  const [sweepMetric, setSweepMetric] = React.useState('eval/loss');
  const [lowerIsBetter, setLowerIsBetter] = React.useState(true);

  const setupEditorRef = useRef<any>(null);
  const commandEditorRef = useRef<any>(null);
  const yamlEditorRef = useRef<any>(null);

  // YAML/GUI mode toggle (default to YAML)
  const [isYamlMode, setIsYamlMode] = React.useState(true);
  const [yamlContent, setYamlContent] = React.useState('');

  React.useEffect(() => {
    if (!task) return;
    setTitle(task.name || '');

    // For templates, fields are stored directly (not nested in config)
    const cfg = SafeJSONParse(task.config, {});

    // Check if it's a template (no config or config is empty/doesn't have nested structure)
    const isTemplate =
      !task.config ||
      (typeof cfg === 'object' && Object.keys(cfg).length === 0) ||
      (!cfg.command && !cfg.cluster_name && (task as any).command);

    // Use template fields directly if it's a template, otherwise use config
    const taskAny = task as any;
    setClusterName(
      isTemplate ? taskAny.cluster_name || '' : cfg.cluster_name || '',
    );
    setCommand(isTemplate ? taskAny.command || '' : cfg.command || '');
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
    setDiskSpace(
      isTemplate
        ? taskAny.disk_space != null
          ? String(taskAny.disk_space)
          : ''
        : cfg.disk_space != null
          ? String(cfg.disk_space)
          : '',
    );
    setAccelerators(
      isTemplate
        ? taskAny.accelerators != null
          ? String(taskAny.accelerators)
          : ''
        : cfg.accelerators != null
          ? String(cfg.accelerators)
          : '',
    );
    setNumNodes(
      isTemplate
        ? taskAny.num_nodes != null
          ? String(taskAny.num_nodes)
          : ''
        : cfg.num_nodes != null
          ? String(cfg.num_nodes)
          : '',
    );
    setMinutesRequested(
      isTemplate
        ? taskAny.minutes_requested != null
          ? String(taskAny.minutes_requested)
          : ''
        : cfg.minutes_requested != null
          ? String(cfg.minutes_requested)
          : '',
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
    setSelectedProviderId(
      isTemplate ? taskAny.provider_id || '' : cfg.provider_id || '',
    );

    // Initialize env_vars
    const envVars = isTemplate ? taskAny.env_vars : cfg.env_vars;
    if (envVars && typeof envVars === 'object') {
      const envVarsArray = Object.entries(envVars).map(([key, value]) => ({
        key,
        value: String(value),
      }));
      setEnvVars(
        envVarsArray.length > 0 ? envVarsArray : [{ key: '', value: '' }],
      );
    } else {
      setEnvVars([{ key: '', value: '' }]);
    }

    // Initialize parameters
    const parameters = isTemplate ? taskAny.parameters : cfg.parameters;
    if (parameters && typeof parameters === 'object') {
      const parametersArray = Object.entries(parameters).map(([key, value]) => {
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
      });
      setParameters(
        parametersArray.length > 0
          ? parametersArray
          : [{ key: '', value: '', valueType: 'string' }],
      );
    } else {
      setParameters([{ key: '', value: '', valueType: 'string' }]);
    }

    // Initialize file_mounts
    const fileMounts = isTemplate ? taskAny.file_mounts : cfg.file_mounts;
    if (fileMounts && typeof fileMounts === 'object') {
      const fmArray = Object.entries(fileMounts).map(
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

    // Initialize GitHub fields
    const githubRepoUrlValue = isTemplate
      ? taskAny.github_repo_url || ''
      : cfg.github_repo_url || '';
    setGithubRepoUrl(githubRepoUrlValue);
    setGithubEnabled(!!githubRepoUrlValue); // Infer from repo URL
    setGithubDirectory(
      isTemplate ? taskAny.github_directory || '' : cfg.github_directory || '',
    );

    // Initialize sweep configuration
    setEnableSweeps(
      isTemplate ? taskAny.run_sweeps || false : cfg.run_sweeps || false,
    );

    // Initialize YAML mode
    setIsYamlMode(true);
    setSweepMetric(
      isTemplate
        ? taskAny.sweep_metric || 'eval/loss'
        : cfg.sweep_metric || 'eval/loss',
    );
    setLowerIsBetter(
      isTemplate
        ? taskAny.lower_is_better !== undefined
          ? taskAny.lower_is_better
          : true
        : cfg.lower_is_better !== undefined
          ? cfg.lower_is_better
          : true,
    );

    // Convert sweep_config object to array format for editing
    const sweepConfig = isTemplate ? taskAny.sweep_config : cfg.sweep_config;
    if (sweepConfig && typeof sweepConfig === 'object') {
      const sweepParamsArray = Object.entries(sweepConfig).map(
        ([paramName, values]) => ({
          paramName,
          values: Array.isArray(values) ? values.join(',') : String(values),
        }),
      );
      setSweepParams(
        sweepParamsArray.length > 0
          ? sweepParamsArray
          : [{ paramName: '', values: '' }],
      );
    } else {
      setSweepParams([{ paramName: '', values: '' }]);
    }
  }, [task]);

  // Convert task to YAML after all state is initialized
  React.useEffect(() => {
    if (task && title && isYamlMode && open) {
      // Small delay to ensure all state is set
      const timer = setTimeout(() => {
        convertTaskToYaml();
      }, 300);
      return () => clearTimeout(timer);
    }
  }, [
    task,
    title,
    cpus,
    memory,
    command,
    setup,
    envVars,
    parameters,
    selectedProviderId,
    githubRepoUrl,
    githubDirectory,
    enableSweeps,
    sweepParams,
    sweepMetric,
    lowerIsBetter,
    isYamlMode,
    open,
  ]);

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

  // Keep Monaco editors in sync if the state changes after mount.
  // We avoid showing blocking alerts here because Monaco can mount lazily
  // (especially on first open or when switching from YAML -> GUI view).
  React.useEffect(() => {
    if (!task || isYamlMode) return;
    if (!setupEditorRef.current) return;

    try {
      if (typeof setupEditorRef.current.setValue === 'function') {
        setupEditorRef.current.setValue(setup ?? '');
      }
    } catch (e) {
      // eslint-disable-next-line no-console
      console.warn('Failed to sync setup editor value:', e);
    }
  }, [task, setup, isYamlMode]);

  React.useEffect(() => {
    if (!task || isYamlMode) return;
    if (!commandEditorRef.current) return;

    try {
      if (typeof commandEditorRef.current.setValue === 'function') {
        commandEditorRef.current.setValue(command ?? '');
      }
    } catch (e) {
      // eslint-disable-next-line no-console
      console.warn('Failed to sync command editor value:', e);
    }
  }, [task, command, isYamlMode]);

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

  // Convert current task to YAML
  const convertTaskToYaml = () => {
    if (!task) return;

    const yamlData: any = {
      task: {
        name: title || task.name || 'untitled-task',
      },
    };

    // Resources
    if (selectedProviderId) {
      const provider = providers.find((p) => p.id === selectedProviderId);
      if (provider) {
        yamlData.task.resources = {
          compute_provider: provider.name,
        };
      }
    }
    if (cpus)
      yamlData.task.resources = {
        ...yamlData.task.resources,
        cpus: parseInt(cpus) || cpus,
      };
    if (memory)
      yamlData.task.resources = {
        ...yamlData.task.resources,
        memory: parseInt(memory) || memory,
      };
    if (diskSpace)
      yamlData.task.resources = {
        ...yamlData.task.resources,
        disk_space: parseInt(diskSpace) || diskSpace,
      };
    if (accelerators)
      yamlData.task.resources = { ...yamlData.task.resources, accelerators };
    if (numNodes)
      yamlData.task.resources = {
        ...yamlData.task.resources,
        num_nodes: parseInt(numNodes) || numNodes,
      };
    if (minutesRequested)
      yamlData.task.minutes_requested =
        parseInt(minutesRequested) || minutesRequested;

    // Environment variables
    const envs: Record<string, string> = {};
    envVars.forEach(({ key, value }) => {
      if (key.trim() && value.trim()) {
        envs[key.trim()] = value.trim();
      }
    });
    if (Object.keys(envs).length > 0) {
      yamlData.task.envs = envs;
    }

    // Setup and run
    const setupValue = setupEditorRef?.current?.getValue?.() || setup;
    if (setupValue) yamlData.task.setup = setupValue;
    const commandValue = commandEditorRef?.current?.getValue?.() || command;
    if (commandValue) yamlData.task.run = commandValue;

    // GitHub
    if (githubRepoUrl) yamlData.task.git_repo = githubRepoUrl;
    if (githubDirectory) yamlData.task.git_repo_directory = githubDirectory;

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
      yamlData.task.parameters = parametersObj;
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
        yamlData.task.sweeps = {
          sweep_config: sweepConfig,
          sweep_metric: sweepMetric || 'eval/loss',
          lower_is_better: lowerIsBetter,
        };
      }
    }

    // Convert to YAML string
    const yamlString = convertToYamlString(yamlData);
    setYamlContent(yamlString);
  };

  // Parse YAML and populate form
  const parseYamlToForm = async () => {
    if (!yamlContent.trim()) {
      addNotification({ type: 'warning', message: 'YAML content is empty' });
      return;
    }

    try {
      // Parse YAML on frontend - simple parser with support for arrays ("- value")
      const parseYaml = (yamlStr: string): any => {
        const lines = yamlStr.split('\n');
        const result: any = {};
        const stack: Array<{
          obj: any;
          level: number;
          parent?: any;
          keyInParent?: string;
        }> = [{ obj: result, level: -1 }];

        const parseScalar = (value: string): any => {
          if (
            (value.startsWith('"') && value.endsWith('"')) ||
            (value.startsWith("'") && value.endsWith("'"))
          ) {
            value = value.slice(1, -1);
          }

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

          if (!trimmed || trimmed.startsWith('#')) continue;

          const indent = line.length - line.trimStart().length;
          const level = Math.floor(indent / 2);

          while (stack.length > 1 && stack[stack.length - 1].level >= level) {
            stack.pop();
          }

          const top = stack[stack.length - 1];
          const current = top.obj;

          // Handle array item "- value"
          if (trimmed.startsWith('- ')) {
            const valueStr = trimmed.slice(2).trim();
            const value = parseScalar(valueStr);

            if (!Array.isArray(current)) {
              const newArr: any[] = [];
              if (top.parent && top.keyInParent) {
                top.parent[top.keyInParent] = newArr;
              }
              top.obj = newArr;
            }

            (top.obj as any[]).push(value);
            continue;
          }

          if (trimmed.endsWith(':')) {
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
            const colonIndex = trimmed.indexOf(':');
            if (colonIndex > 0) {
              const key = trimmed.slice(0, colonIndex).trim();
              const valueStr = trimmed.slice(colonIndex + 1).trim();
              const value = parseScalar(valueStr);
              current[key] = value;
            }
          }
        }

        return result;
      };

      const yamlData = parseYaml(yamlContent);

      if (!yamlData || !yamlData.task) {
        throw new Error("YAML must contain a 'task' key");
      }

      const taskYaml = yamlData.task;
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

      // GitHub
      if (taskYaml.git_repo) {
        taskData.github_repo_url = String(taskYaml.git_repo);
      }
      if (taskYaml.git_repo_directory) {
        taskData.github_directory = String(taskYaml.git_repo_directory);
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
      setGithubEnabled(!!taskData.github_repo_url);

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

      // Provider
      if (taskData.provider_name) {
        const provider = providers.find(
          (p) => p.name === taskData.provider_name,
        );
        if (provider) {
          setSelectedProviderId(provider.id);
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // If we're in YAML mode, parse it first
    if (isYamlMode) {
      await parseYamlToForm();
      setIsYamlMode(false);
      // Wait a bit for state to update
      await new Promise((resolve) => setTimeout(resolve, 100));
    }

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
        const uploadUrl = chatAPI.Endpoints.ComputeProvider.UploadTemplateFile(
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

    // For templates, all fields are stored directly (not nested in config)
    // Check if it's a template (no config or config is empty/doesn't have nested structure)
    const existingConfig = SafeJSONParse(task.config, {});
    const isTemplate =
      !task.config ||
      (typeof existingConfig === 'object' &&
        Object.keys(existingConfig).length === 0) ||
      (!existingConfig.command &&
        !existingConfig.cluster_name &&
        (task as any).command);

    // Build update body - for templates, all fields go directly (flat structure)
    // For backward compatibility with old tasks, we could support both, but since we're migrating to templates,
    // we'll use the template format
    const taskAny = task as any;
    const updateBody: any = {
      name: title,
      cluster_name: clusterName,
      command: commandValue,
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
      file_mounts:
        Object.keys(fileMountsObj).length > 0 ? fileMountsObj : undefined,
      // GitHub fields - preserve from existing template or use current values
      github_repo_url: isTemplate
        ? taskAny.github_repo_url || githubRepoUrl || undefined
        : existingConfig.github_repo_url || githubRepoUrl || undefined,
      github_directory: isTemplate
        ? taskAny.github_directory || githubDirectory || undefined
        : existingConfig.github_directory || githubDirectory || undefined,
      // Sweep configuration
      run_sweeps:
        enableSweeps &&
        sweepParams.some((sp) => sp.paramName.trim() && sp.values.trim())
          ? true
          : undefined,
      sweep_config: (() => {
        if (!enableSweeps) return undefined;
        const sweepConfig: Record<string, string[]> = {};
        sweepParams.forEach((sp) => {
          const paramName = sp.paramName.trim();
          const values = sp.values.trim();
          if (paramName && values) {
            sweepConfig[paramName] = values
              .split(',')
              .map((v) => v.trim())
              .filter((v) => v.length > 0);
          }
        });
        return Object.keys(sweepConfig).length > 0 ? sweepConfig : undefined;
      })(),
      sweep_metric:
        enableSweeps &&
        sweepParams.some((sp) => sp.paramName.trim() && sp.values.trim())
          ? sweepMetric || 'eval/loss'
          : undefined,
      lower_is_better:
        enableSweeps &&
        sweepParams.some((sp) => sp.paramName.trim() && sp.values.trim())
          ? lowerIsBetter
          : undefined,
    };

    const providerMeta = providers.find(
      (provider) => provider.id === selectedProviderId,
    );
    if (providerMeta) {
      updateBody.provider_name = providerMeta.name;
    }

    // Preserve other template fields that shouldn't be changed
    if (isTemplate) {
      // Preserve type, plugin, experiment_id, subtype, etc. if they exist
      if (taskAny.type) updateBody.type = taskAny.type;
      if (taskAny.plugin) updateBody.plugin = taskAny.plugin;
      if (taskAny.experiment_id)
        updateBody.experiment_id = taskAny.experiment_id;
      if (taskAny.subtype) updateBody.subtype = taskAny.subtype;
      if (taskAny.interactive_type)
        updateBody.interactive_type = taskAny.interactive_type;
    }

    try {
      const response = await chatAPI.authenticatedFetch(
        chatAPI.Endpoints.Task.UpdateTemplate(task.id),
        {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            accept: 'application/json',
          },
          body: JSON.stringify(updateBody),
        },
      );

      if (!response.ok) {
        const txt = await response.text();
        addNotification({
          type: 'danger',
          message: `Failed to save template: ${txt}`,
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
      addNotification({ type: 'danger', message: 'Failed to save template.' });
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
            <Stack
              direction="row"
              spacing={2}
              alignItems="center"
              justifyContent="space-between"
              sx={{ mb: 2 }}
            >
              <Typography level="title-md">Task Configuration</Typography>
              <Stack direction="row" spacing={1} alignItems="center">
                <Typography level="body-sm">GUI</Typography>
                <Switch
                  checked={isYamlMode}
                  onChange={(e) => {
                    const newMode = e.target.checked;
                    setIsYamlMode(newMode);
                    if (newMode) {
                      // Switching to YAML mode - convert form data to YAML
                      convertTaskToYaml();
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
                      yamlEditorRef.current = editor;
                      setTheme(editor, monaco);
                    }}
                    theme="my-theme"
                    options={{
                      minimap: { enabled: false },
                      fontSize: 14,
                      lineNumbers: 'on',
                      scrollBeyondLastLine: false,
                      automaticLayout: true,
                    }}
                  />
                </div>
                <FormHelperText>
                  Define your task configuration in YAML format. See
                  documentation for structure.
                </FormHelperText>
              </FormControl>
            ) : (
              <>
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
                    Optional environment variables to set when launching the
                    cluster
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

                              // Auto-append a new blank row when the last row gets content,
                              // so the user doesn't have to click "Add Parameter" to make
                              // the current row count.
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
                    Task parameters accessible via lab.get_config() in your
                    script. Use JSON type for complex objects.
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

                <FormControl sx={{ mt: 2 }}>
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
                                  setSweepParams([
                                    { paramName: '', values: '' },
                                  ]);
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
