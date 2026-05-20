import * as React from 'react';
import Modal from '@mui/joy/Modal';
import DialogTitle from '@mui/joy/DialogTitle';
import DialogContent from '@mui/joy/DialogContent';
import DialogActions from '@mui/joy/DialogActions';
import Button from '@mui/joy/Button';
import FormControl from '@mui/joy/FormControl';
import FormLabel from '@mui/joy/FormLabel';
import {
  Alert,
  FormHelperText,
  ModalClose,
  ModalDialog,
  Option,
  Select,
  Stack,
  Typography,
  Divider,
} from '@mui/joy';
import { PlayIcon, AlertTriangleIcon } from 'lucide-react';
import { useSWRWithAuth as useSWR, useAPI } from 'renderer/lib/authContext';
import * as chatAPI from 'renderer/lib/transformerlab-api-sdk';
import { fetcher, getAPIFullPath } from 'renderer/lib/transformerlab-api-sdk';
import { useAuth } from 'renderer/lib/authContext';
import SweepConfigSection from '../SweepConfigSection';
import SafeJSONParse from 'renderer/components/Shared/SafeJSONParse';
import { getPreferredProviderId } from '../providerCompatibility';
import SlurmFlagsSection, { createSlurmFlag } from './SlurmFlagsSection';
import TrackingSection from './TrackingSection';
import ProfilingSection from './ProfilingSection';
import DescriptionSection from './DescriptionSection';
import ResourceOverridesSection, {
  type SkypilotOverrides,
} from './ResourceOverridesSection';
import ParameterOverridesSection from './ParameterOverridesSection';
import type {
  ParameterSchema,
  ProcessedParameter,
  ProviderResourceGroup,
  SlurmFlag,
} from './types';

type QueueTaskModalProps = {
  open: boolean;
  onClose: () => void;
  task: any;
  onSubmit: (config: Record<string, any>) => void;
  isSubmitting?: boolean;
  experimentId?: string;
};

function parseParameter(key: string, value: any): ProcessedParameter {
  const isObject =
    typeof value === 'object' && value !== null && !Array.isArray(value);
  const hasSchemaFields =
    isObject &&
    ('type' in value ||
      'default' in value ||
      'min' in value ||
      'max' in value ||
      'options' in value ||
      'enum' in value);

  if (hasSchemaFields) {
    const schema = value as ParameterSchema;
    return {
      key,
      value: schema.default !== undefined ? schema.default : '',
      schema,
      isShorthand: false,
    };
  }
  return { key, value, schema: null, isShorthand: true };
}

function validateParameter(param: ProcessedParameter): string | null {
  const { schema, value } = param;
  if (!schema) return null;
  const numValue = Number(value);
  if (schema.min !== undefined && !Number.isNaN(numValue)) {
    if (numValue < schema.min) return `Minimum value is ${schema.min}`;
  }
  if (schema.max !== undefined && !Number.isNaN(numValue)) {
    if (numValue > schema.max) return `Maximum value is ${schema.max}`;
  }
  return null;
}

export default function QueueTaskModal({
  open,
  onClose,
  task,
  onSubmit,
  isSubmitting = false,
  experimentId = '',
}: QueueTaskModalProps) {
  const { team } = useAuth();
  const [parameters, setParameters] = React.useState<ProcessedParameter[]>([]);
  const [customModelDataset, setCustomModelDataset] = React.useState<
    Set<number>
  >(new Set());
  const [validationErrors, setValidationErrors] = React.useState<
    Record<number, string>
  >({});
  const [selectedProviderId, setSelectedProviderId] = React.useState('');
  const [runSweeps, setRunSweeps] = React.useState(false);
  const [sweepConfig, setSweepConfig] = React.useState<Record<string, any[]>>(
    {},
  );
  const [sweepMetric, setSweepMetric] = React.useState('eval/loss');
  const [lowerIsBetter, setLowerIsBetter] = React.useState(true);
  const [jobSlurmFlags, setJobSlurmFlags] = React.useState<SlurmFlag[]>([
    createSlurmFlag(),
  ]);
  const [skypilotOverrides, setSkypilotOverrides] =
    React.useState<SkypilotOverrides>({
      dockerImage: '',
      region: '',
      useSpot: false,
    });
  const [jobDstackFleetName, setJobDstackFleetName] = React.useState('');
  const [useTrackio, setUseTrackio] = React.useState(false);
  const [useProfiling, setUseProfiling] = React.useState(false);
  const [useProfilingTorch, setUseProfilingTorch] = React.useState(false);
  const [trackioProjectName, setTrackioProjectName] = React.useState('');
  const [cpusInput, setCpusInput] = React.useState('');
  const [memoryInput, setMemoryInput] = React.useState('');
  const [diskSpaceInput, setDiskSpaceInput] = React.useState('');
  const [acceleratorsInput, setAcceleratorsInput] = React.useState('');
  const [numNodesInput, setNumNodesInput] = React.useState('');
  const [minutesRequestedInput, setMinutesRequestedInput] = React.useState('');
  const [showResourceOverrides, setShowResourceOverrides] =
    React.useState(false);
  const [resourceOverrideMode, setResourceOverrideMode] = React.useState<
    'manual' | 'group'
  >('manual');
  const [selectedResourceGroupId, setSelectedResourceGroupId] =
    React.useState('');
  const [resourceGroupCustomized, setResourceGroupCustomized] =
    React.useState(false);
  const [showParameterOverrides, setShowParameterOverrides] =
    React.useState(true);
  const [jobDescription, setJobDescription] = React.useState('');
  const [showDescription, setShowDescription] = React.useState(false);
  const resourceOverridesRef = React.useRef<HTMLDivElement | null>(null);
  const loadingMessages = React.useMemo(
    () => [
      'Contacting compute provider…',
      'Reserving resources…',
      'Preparing environment…',
      'Submitting job configuration…',
      'Waiting for job ID…',
    ],
    [],
  );
  const [loadingMessageIndex, setLoadingMessageIndex] = React.useState(0);

  React.useEffect(() => {
    if (!open || !isSubmitting || loadingMessages.length === 0) {
      return;
    }
    setLoadingMessageIndex(0);
    const interval = window.setInterval(() => {
      setLoadingMessageIndex((prev) => {
        const lastIndex = loadingMessages.length - 1;
        if (prev >= lastIndex) return lastIndex;
        return prev + 1;
      });
    }, 1500);
    return () => {
      window.clearInterval(interval);
    };
  }, [open, isSubmitting, loadingMessages]);

  React.useEffect(() => {
    if (!showResourceOverrides) return;
    window.requestAnimationFrame(() => {
      resourceOverridesRef.current?.scrollIntoView({
        behavior: 'smooth',
        block: 'nearest',
      });
    });
  }, [showResourceOverrides]);

  const { data: modelsData } = useSWR(
    open ? chatAPI.Endpoints.Models.LocalList() : null,
    fetcher,
  );
  const { data: datasetsData } = useSWR(
    open ? chatAPI.Endpoints.Dataset.LocalList() : null,
    fetcher,
  );

  const trackioProjectsKey =
    open && useTrackio && experimentId
      ? `${chatAPI.API_URL()}trackio/projects?experiment_id=${encodeURIComponent(experimentId)}`
      : null;
  const { data: trackioProjectsData } = useSWR(trackioProjectsKey, fetcher);
  const trackioProjects: string[] = Array.isArray(trackioProjectsData?.projects)
    ? trackioProjectsData.projects
    : [];

  const {
    data: providerListData,
    error: providerListError,
    isLoading: providersIsLoading,
  } = useAPI('compute_provider', ['list'], { teamId: team?.id ?? null });

  if (providerListError) {
    // eslint-disable-next-line no-console
    console.error('Failed to fetch providers', providerListError);
  }

  const providers = React.useMemo(
    () => (Array.isArray(providerListData) ? providerListData : []),
    [providerListData],
  );

  const selectedProvider = React.useMemo(
    () => providers.find((p: any) => p.id === selectedProviderId),
    [providers, selectedProviderId],
  );
  const isLocalProvider = selectedProvider?.type === 'local';
  const isSlurmProvider = selectedProvider?.type === 'slurm';
  const isSkypilotProvider = selectedProvider?.type === 'skypilot';
  const isDstackProvider = selectedProvider?.type === 'dstack';
  const isGalleryImported = Boolean((task as any)?.gallery_import);

  const providerResourceGroups = React.useMemo<ProviderResourceGroup[]>(() => {
    const groups = (selectedProvider?.config as any)?.resource_groups;
    if (!Array.isArray(groups)) return [];
    const result: ProviderResourceGroup[] = [];
    for (const group of groups) {
      if (!group || typeof group !== 'object') continue;
      const normalized: ProviderResourceGroup = {
        id: String(group.id || ''),
        name: String(group.name || ''),
        cpus: group.cpus != null ? String(group.cpus) : undefined,
        memory: group.memory != null ? String(group.memory) : undefined,
        disk_space:
          group.disk_space != null ? String(group.disk_space) : undefined,
        accelerators:
          group.accelerators != null ? String(group.accelerators) : undefined,
        num_nodes:
          group.num_nodes != null ? String(group.num_nodes) : undefined,
      };
      if (normalized.id && normalized.name) result.push(normalized);
    }
    return result;
  }, [selectedProvider]);

  React.useEffect(() => {
    if (!selectedResourceGroupId) return;
    const stillExists = providerResourceGroups.some(
      (group) => group.id === selectedResourceGroupId,
    );
    if (!stillExists) {
      setSelectedResourceGroupId('');
      setResourceOverrideMode('manual');
      setResourceGroupCustomized(false);
    }
  }, [providerResourceGroups, selectedResourceGroupId]);

  const markCustomResourceOverride = React.useCallback(() => {
    if (resourceOverrideMode === 'group' && selectedResourceGroupId) {
      setResourceGroupCustomized(true);
    }
  }, [resourceOverrideMode, selectedResourceGroupId]);

  const suggestedGalleryResources = React.useMemo(() => {
    if (!isGalleryImported) return null;
    const mapping = (task as any)?.supportedAccelerators as
      | Record<
          string,
          { resources?: Record<string, unknown> | undefined } | undefined
        >
      | undefined;
    if (!mapping || typeof mapping !== 'object') return null;
    const providerSupported = selectedProvider?.config?.supported_accelerators;
    if (!Array.isArray(providerSupported)) return null;
    const providerSupportedLower = new Set(
      providerSupported.map((s: any) => String(s).toLowerCase()),
    );
    const priority = ['NVIDIA', 'AMD', 'AppleSilicon', 'cpu'];
    for (const candidate of priority) {
      const candidateLower = candidate.toLowerCase();
      if (!providerSupportedLower.has(candidateLower)) continue;
      const entry = (mapping as any)[candidate];
      const resources = entry?.resources;
      if (!resources || typeof resources !== 'object') continue;
      const accelerators = (resources as any).accelerators;
      const cpus = (resources as any).cpus;
      const memory = (resources as any).memory;
      return {
        category: candidate,
        accelerators: accelerators ? String(accelerators) : undefined,
        cpus: cpus ? String(cpus) : undefined,
        memory: memory ? String(memory) : undefined,
      };
    }
    return null;
  }, [isGalleryImported, selectedProvider, task]);

  const slurmUserSettingsKey =
    open && isSlurmProvider && selectedProviderId
      ? getAPIFullPath('compute_provider', ['user-settings'], {
          providerId: selectedProviderId,
        })
      : null;
  const { data: slurmUserSettings } = useSWR(slurmUserSettingsKey, fetcher);

  const clustersKey =
    open && isLocalProvider && selectedProviderId
      ? getAPIFullPath('compute_provider', ['providerClusters'], {
          providerId: selectedProviderId,
        })
      : null;
  const { data: providerClustersData } = useSWR(clustersKey, fetcher);
  const localProviderConfig = React.useMemo(() => {
    const clusters = Array.isArray(providerClustersData)
      ? providerClustersData
      : [];
    const localCluster =
      clusters.find(
        (c: any) => String(c?.backend_type).toLowerCase() === 'local',
      ) ??
      clusters[0] ??
      null;
    return (localCluster?.provider_data as any) ?? null;
  }, [providerClustersData]);

  const taskResources = React.useMemo(() => {
    if (!task) return null;
    const cfg =
      task.config !== undefined ? SafeJSONParse(task.config, task) : task;
    let accelerators = cfg.accelerators || task.accelerators || null;
    const cpus = cfg.cpus || task.cpus || null;
    const memory = cfg.memory || task.memory || null;
    if (!accelerators) {
      const computeProvider =
        cfg.compute_provider ||
        task.compute_provider ||
        cfg.provider_name ||
        task.provider_name ||
        null;
      if (computeProvider && /^.+:\d+$/.test(String(computeProvider))) {
        accelerators = String(computeProvider);
      }
    }
    if (!accelerators && !cpus && !memory) return null;
    return { accelerators, cpus, memory };
  }, [task]);

  const effectiveResources = React.useMemo(() => {
    if (!taskResources) {
      const acceleratorsEff =
        acceleratorsInput?.trim() !== '' ? acceleratorsInput.trim() : null;
      const cpusEff = cpusInput?.trim() !== '' ? cpusInput.trim() : null;
      const memoryEff = memoryInput?.trim() !== '' ? memoryInput.trim() : null;
      if (!acceleratorsEff && !cpusEff && !memoryEff) return null;
      return {
        accelerators: acceleratorsEff,
        cpus: cpusEff,
        memory: memoryEff,
      };
    }
    const base = taskResources;
    const cpusEff =
      cpusInput.trim() !== '' ? cpusInput.trim() : (base.cpus as any);
    const memoryEff =
      memoryInput.trim() !== '' ? memoryInput.trim() : (base.memory as any);
    const acceleratorsEff =
      acceleratorsInput.trim() !== ''
        ? acceleratorsInput.trim()
        : (base.accelerators as any);
    if (!acceleratorsEff && !cpusEff && !memoryEff) return null;
    return {
      accelerators: acceleratorsEff,
      cpus: cpusEff,
      memory: memoryEff,
    };
  }, [taskResources, cpusInput, memoryInput, acceleratorsInput]);

  const isProviderCompatible = React.useCallback(
    (provider: any) => {
      if (provider?.type !== 'local') return true;
      if (!effectiveResources || !effectiveResources.accelerators) return true;
      const supported = provider.config?.supported_accelerators || [];
      if (supported.length === 0) return true;
      const reqAcc = String(effectiveResources.accelerators).toLowerCase();
      if (
        (reqAcc.includes('apple') || reqAcc.includes('mps')) &&
        supported.includes('AppleSilicon')
      ) {
        return true;
      }
      if (
        (reqAcc.includes('nvidia') ||
          reqAcc.includes('cuda') ||
          reqAcc.includes('rtx') ||
          reqAcc.includes('a100') ||
          reqAcc.includes('h100') ||
          reqAcc.includes('v100')) &&
        supported.includes('NVIDIA')
      ) {
        return true;
      }
      if (
        (reqAcc.includes('amd') || reqAcc.includes('rocm')) &&
        supported.includes('AMD')
      ) {
        return true;
      }
      if (reqAcc.includes('cpu') && supported.includes('cpu')) return true;
      if (/^\d+$/.test(reqAcc)) {
        if (
          provider.type === 'local' &&
          localProviderConfig?.device === 'mps'
        ) {
          return supported.includes('AppleSilicon');
        }
        return supported.includes('NVIDIA');
      }
      return false;
    },
    [effectiveResources, localProviderConfig],
  );

  const models = modelsData || [];
  const datasets = datasetsData || [];

  const resourceValidation = React.useMemo(() => {
    if (!isLocalProvider || !localProviderConfig || !effectiveResources)
      return null;

    const issues: Array<{
      type: 'error' | 'warning';
      label: string;
      required: string;
      available: string;
    }> = [];

    if (effectiveResources.accelerators) {
      const accStr = String(effectiveResources.accelerators);
      const match = accStr.match(/^(.+):(\d+)$/);
      const gpuList: any[] = localProviderConfig.gpu || [];
      const deviceType = localProviderConfig.device_type || 'cpu';

      if (match) {
        const requiredGpuName = match[1].trim();
        const requiredCount = parseInt(match[2], 10);
        const matchingGpus = gpuList.filter(
          (g: any) =>
            g.name &&
            g.name !== 'cpu' &&
            g.name.toLowerCase().includes(requiredGpuName.toLowerCase()),
        );

        if (
          deviceType === 'cpu' ||
          gpuList.length === 0 ||
          (gpuList.length === 1 && gpuList[0]?.name === 'cpu')
        ) {
          issues.push({
            type: 'error',
            label: 'GPU',
            required: `${requiredGpuName} ×${requiredCount}`,
            available: 'No GPU detected',
          });
        } else if (matchingGpus.length === 0) {
          const availableNames = new Set<string>();
          for (const g of gpuList) {
            if (g.name && g.name !== 'cpu') availableNames.add(g.name);
          }
          const realGpuCount = gpuList.filter(
            (g: any) => g.name !== 'cpu',
          ).length;
          issues.push({
            type: 'warning',
            label: 'GPU',
            required: `${requiredGpuName} ×${requiredCount}`,
            available:
              availableNames.size > 0
                ? `${[...availableNames].join(', ')} ×${realGpuCount}`
                : 'None',
          });
        } else if (matchingGpus.length < requiredCount) {
          issues.push({
            type: 'warning',
            label: 'GPU Count',
            required: `${requiredGpuName} ×${requiredCount}`,
            available: `${requiredGpuName} ×${matchingGpus.length}`,
          });
        }
      } else {
        const requiredCount = parseInt(accStr, 10);
        if (!isNaN(requiredCount) && requiredCount > 0) {
          const realGpus = gpuList.filter(
            (g: any) => g.name && g.name !== 'cpu',
          );
          if (realGpus.length < requiredCount) {
            issues.push({
              type: realGpus.length === 0 ? 'error' : 'warning',
              label: 'GPU',
              required: `${requiredCount} GPU(s)`,
              available:
                realGpus.length === 0
                  ? 'No GPU detected'
                  : `${realGpus.length} GPU(s)`,
            });
          }
        }
      }
    }

    const hasErrors = issues.some((i) => i.type === 'error');
    const hasWarnings = issues.some((i) => i.type === 'warning');

    return {
      issues,
      hasErrors,
      hasWarnings,
      isCompatible: issues.length === 0,
    };
  }, [isLocalProvider, localProviderConfig, effectiveResources]);

  React.useEffect(() => {
    if (open && task) {
      const cfg =
        task.config !== undefined ? SafeJSONParse(task.config, task) : task;

      const taskParameters = cfg.parameters || task.parameters || {};
      if (typeof taskParameters === 'object' && taskParameters !== null) {
        setParameters(
          Object.entries(taskParameters).map(([key, value]) =>
            parseParameter(key, value),
          ),
        );
      } else {
        setParameters([]);
      }

      const taskProviderId = cfg.provider_id ?? task.provider_id ?? '';
      const taskProviderInList = providers.some(
        (p: { id: string }) => p.id === taskProviderId,
      );
      setSelectedProviderId(
        taskProviderInList ? taskProviderId : getPreferredProviderId(providers),
      );

      setRunSweeps(cfg.run_sweeps ?? task.run_sweeps ?? false);
      if (cfg.sweep_config || task.sweep_config) {
        const sweepCfg =
          typeof cfg.sweep_config === 'string'
            ? SafeJSONParse(cfg.sweep_config, cfg.sweep_config)
            : cfg.sweep_config || task.sweep_config;
        setSweepConfig(sweepCfg || {});
      } else {
        setSweepConfig({});
      }
      setSweepMetric(cfg.sweep_metric || task.sweep_metric || 'eval/loss');
      setLowerIsBetter(
        cfg.lower_is_better !== undefined
          ? cfg.lower_is_better
          : task.lower_is_better !== undefined
            ? task.lower_is_better
            : true,
      );

      const stringifyOrEmpty = (v: any) =>
        v !== null && v !== undefined ? String(v) : '';

      setCpusInput(stringifyOrEmpty(cfg.cpus ?? task.cpus));
      setMemoryInput(stringifyOrEmpty(cfg.memory ?? task.memory));
      setDiskSpaceInput(stringifyOrEmpty(cfg.disk_space ?? task.disk_space));
      setAcceleratorsInput(
        stringifyOrEmpty(cfg.accelerators ?? task.accelerators),
      );
      setNumNodesInput(stringifyOrEmpty(cfg.num_nodes ?? task.num_nodes));
      setMinutesRequestedInput(
        stringifyOrEmpty(cfg.minutes_requested ?? task.minutes_requested),
      );
      setResourceOverrideMode('manual');
      setSelectedResourceGroupId('');
      setResourceGroupCustomized(false);

      const initDescription = stringifyOrEmpty(
        cfg.description ?? task.description,
      );
      setJobDescription(initDescription);
      setShowDescription(Boolean(initDescription.trim()));
    }
  }, [open, task, providers]);

  React.useEffect(() => {
    if (!open || !isSlurmProvider || !slurmUserSettings) return;
    const raw = (slurmUserSettings as any).custom_sbatch_flags || '';
    const lines: string[] = [];
    for (const line of String(raw).split('\n')) {
      const trimmed = line.trim();
      if (trimmed.length > 0) lines.push(trimmed);
    }
    setJobSlurmFlags(
      lines.length > 0
        ? lines.map((value) => createSlurmFlag(value))
        : [createSlurmFlag()],
    );
  }, [open, isSlurmProvider, selectedProviderId, slurmUserSettings]);

  React.useEffect(() => {
    if (!open || !isSkypilotProvider || !selectedProvider) return;
    const cfg = selectedProvider.config || {};
    setSkypilotOverrides({
      dockerImage: cfg.docker_image || '',
      region: cfg.default_region || '',
      useSpot: cfg.use_spot === true,
    });
  }, [open, isSkypilotProvider, selectedProviderId, selectedProvider]);

  React.useEffect(() => {
    if (!open || !isDstackProvider || !selectedProvider) return;
    const providerCfg = selectedProvider.config || {};
    const taskCfg =
      task?.config !== undefined ? SafeJSONParse(task.config, {}) : {};
    const taskRunCfg = taskCfg?.config || {};
    const taskResourcesCfg = taskRunCfg?.resources || {};
    setJobDstackFleetName(
      String(
        taskRunCfg.fleet_name ||
          taskResourcesCfg.fleet_name ||
          providerCfg.fleet_name ||
          '',
      ),
    );
  }, [open, isDstackProvider, selectedProviderId, selectedProvider, task]);

  const validateAllParameters = (): string | null => {
    for (const param of parameters) {
      if (!param.key.trim()) continue;
      const error = validateParameter(param);
      if (error) return `${param.key}: ${error}`;
    }
    return null;
  };

  const updateParameterValue = React.useCallback(
    (index: number, value: any) => {
      setParameters((prev) => {
        const next = [...prev];
        next[index] = { ...next[index], value };
        return next;
      });
    },
    [],
  );

  const updateParameterValueWithValidate = React.useCallback(
    (index: number, value: any) => {
      setParameters((prev) => {
        const next = [...prev];
        next[index] = { ...next[index], value };
        const error = validateParameter(next[index]);
        setValidationErrors((prevErrors) => {
          const updated = { ...prevErrors };
          if (error) updated[index] = error;
          else delete updated[index];
          return updated;
        });
        return next;
      });
    },
    [],
  );

  const toggleCustomModelDataset = React.useCallback(
    (index: number, isCustom: boolean) => {
      if (isCustom) {
        setParameters((prev) => {
          const next = [...prev];
          if (next[index].value === null || next[index].value === undefined) {
            next[index] = { ...next[index], value: '' };
          }
          return next;
        });
        setCustomModelDataset((prev) => new Set(prev).add(index));
      } else {
        setCustomModelDataset((prev) => {
          const next = new Set(prev);
          next.delete(index);
          return next;
        });
      }
    },
    [],
  );

  const handleResourceFieldChange = React.useCallback(
    (field: string, value: string) => {
      switch (field) {
        case 'cpus':
          setCpusInput(value);
          break;
        case 'memory':
          setMemoryInput(value);
          break;
        case 'diskSpace':
          setDiskSpaceInput(value);
          break;
        case 'accelerators':
          setAcceleratorsInput(value);
          break;
        case 'numNodes':
          setNumNodesInput(value);
          break;
        case 'minutesRequested':
          setMinutesRequestedInput(value);
          break;
      }
      if (field !== 'minutesRequested') markCustomResourceOverride();
    },
    [markCustomResourceOverride],
  );

  const handleResourceOverrideModeChange = React.useCallback(
    (nextMode: 'manual' | 'group') => {
      setResourceOverrideMode(nextMode);
      if (nextMode === 'manual') {
        setSelectedResourceGroupId('');
        setResourceGroupCustomized(false);
      }
    },
    [],
  );

  const handleSelectResourceGroup = React.useCallback(
    (groupId: string) => {
      setSelectedResourceGroupId(groupId);
      setResourceGroupCustomized(false);
      const group = providerResourceGroups.find((g) => g.id === groupId);
      if (!group) return;
      setCpusInput(group.cpus || '');
      setMemoryInput(group.memory || '');
      setDiskSpaceInput(group.disk_space || '');
      setAcceleratorsInput(group.accelerators || '');
      setNumNodesInput(group.num_nodes || '');
    },
    [providerResourceGroups],
  );

  const handleProviderChange = React.useCallback((value: string | null) => {
    setSelectedProviderId(value || '');
    setSelectedResourceGroupId('');
    setResourceOverrideMode('manual');
    setResourceGroupCustomized(false);
  }, []);

  const handleSubmit = () => {
    if (!selectedProviderId) {
      alert('Please select a compute provider before submitting');
      return;
    }

    const validationError = validateAllParameters();
    if (validationError) {
      alert(`Validation error: ${validationError}`);
      return;
    }

    if (runSweeps && Object.keys(sweepConfig).length === 0) {
      alert(
        'Please add at least one parameter to sweep, or disable hyperparameter sweeps.',
      );
      return;
    }

    const config: Record<string, any> = {};
    parameters.forEach(({ key, value }) => {
      if (key.trim()) config[key.trim()] = value;
    });

    config.provider_id = selectedProviderId;

    const provider = providers.find((p) => p.id === selectedProviderId);
    const selectedResourceGroup = providerResourceGroups.find(
      (group) => group.id === selectedResourceGroupId,
    );
    if (provider) config.provider_name = provider.name;

    if (resourceOverrideMode === 'group' && selectedResourceGroup) {
      config.resource_group_id = selectedResourceGroup.id;
      config.resource_group_name = selectedResourceGroup.name;
      if (resourceGroupCustomized) {
        config.resource_group_custom_override = true;
      }
    }

    if (cpusInput.trim()) config.cpus = cpusInput.trim();
    if (memoryInput.trim()) config.memory = memoryInput.trim();
    if (diskSpaceInput.trim()) config.disk_space = diskSpaceInput.trim();
    if (acceleratorsInput.trim())
      config.accelerators = acceleratorsInput.trim();
    if (numNodesInput.trim()) {
      const parsedNumNodes = Number(numNodesInput.trim());
      config.num_nodes = Number.isNaN(parsedNumNodes)
        ? numNodesInput.trim()
        : parsedNumNodes;
    }
    if (minutesRequestedInput.trim()) {
      const parsedMinutes = Number(minutesRequestedInput.trim());
      if (!Number.isNaN(parsedMinutes) && parsedMinutes > 0) {
        config.minutes_requested = parsedMinutes;
      }
    }
    if (jobDescription.trim()) config.description = jobDescription.trim();

    if (provider?.type === 'slurm') {
      const lines: string[] = [];
      for (const flag of jobSlurmFlags) {
        const trimmed = flag.value.trim();
        if (trimmed.length > 0) lines.push(trimmed);
      }
      if (lines.length > 0) config.custom_sbatch_flags = lines.join('\n');
    }

    if (provider?.type === 'skypilot') {
      if (skypilotOverrides.dockerImage.trim())
        config.docker_image = skypilotOverrides.dockerImage.trim();
      if (skypilotOverrides.region.trim())
        config.region = skypilotOverrides.region.trim();
      if (skypilotOverrides.useSpot) config.use_spot = true;
    }

    if (provider?.type === 'dstack' && jobDstackFleetName.trim()) {
      config.fleet_name = jobDstackFleetName.trim();
    }

    if (runSweeps) {
      config.run_sweeps = true;
      if (Object.keys(sweepConfig).length > 0) {
        config.sweep_config = sweepConfig;
      }
      config.sweep_metric = sweepMetric;
      config.lower_is_better = lowerIsBetter;
    }

    if (useTrackio) {
      config.enable_trackio = true;
      config.trackio_project_name = trackioProjectName.trim() || undefined;
    }

    if (useProfiling) {
      config.enable_profiling = true;
      if (useProfilingTorch) config.enable_profiling_torch = true;
    }

    onSubmit(config);
  };

  const getTaskTitle = () => {
    if (task?.title && task.title.trim() !== '') return task.title;
    return task?.name || 'Task';
  };

  const isProviderIncompatible =
    !!selectedProvider &&
    !!effectiveResources?.accelerators &&
    !isProviderCompatible(selectedProvider);

  const providerType = React.useMemo<
    'local' | 'slurm' | 'skypilot' | 'dstack' | 'other' | null
  >(() => {
    const t = selectedProvider?.type;
    if (t === 'local' || t === 'slurm' || t === 'skypilot' || t === 'dstack') {
      return t;
    }
    return selectedProvider ? 'other' : null;
  }, [selectedProvider]);

  const incompatibilityAccelerators =
    isProviderIncompatible && effectiveResources?.accelerators
      ? String(effectiveResources.accelerators)
      : null;

  return (
    <Modal open={open} onClose={onClose}>
      <ModalDialog
        sx={{
          maxWidth: 700,
          width: '90%',
          maxHeight: '90vh',
          overflow: 'auto',
        }}
      >
        <ModalClose />
        <DialogTitle>Queue Task: {getTaskTitle()}</DialogTitle>
        <Divider />
        <DialogContent>
          <Stack spacing={3}>
            <Stack spacing={2}>
              <Typography level="title-sm">Run Settings</Typography>
              <FormControl required>
                <FormLabel>Compute Provider</FormLabel>
                <Select
                  placeholder={
                    providers.length
                      ? 'Select a compute provider'
                      : 'No compute providers configured'
                  }
                  value={selectedProviderId || null}
                  onChange={(_, value) => handleProviderChange(value)}
                  disabled={
                    isSubmitting || providersIsLoading || providers.length === 0
                  }
                  renderValue={(selected) => {
                    const value = selected?.value;
                    const provider = providers.find(
                      (p: { id: string }) => p.id === value,
                    );
                    return (
                      provider?.name ||
                      (providers.length
                        ? 'Select a compute provider'
                        : 'No compute providers configured')
                    );
                  }}
                  slotProps={{ listbox: { sx: { maxHeight: 240 } } }}
                >
                  {providers.map((provider: any) => (
                    <Option key={provider.id} value={provider.id}>
                      <Stack
                        direction="row"
                        justifyContent="space-between"
                        alignItems="center"
                        sx={{ width: '100%' }}
                      >
                        <Typography>{provider.name}</Typography>
                      </Stack>
                    </Option>
                  ))}
                </Select>
                <FormHelperText>
                  Choose which compute provider should run this task.
                </FormHelperText>
              </FormControl>

              {isGalleryImported && (
                <Alert
                  variant="soft"
                  color="warning"
                  startDecorator={<AlertTriangleIcon size={18} />}
                  sx={{ mt: 1 }}
                >
                  <Typography level="body-sm">
                    This task was imported from the gallery. Please make sure
                    the selected resources for this task match the
                    provider&apos;s availability.
                  </Typography>
                  {suggestedGalleryResources && (
                    <Typography level="body-xs" sx={{ mt: 1 }}>
                      Suggested ({suggestedGalleryResources.category}):{' '}
                      {[
                        suggestedGalleryResources.accelerators &&
                          `accelerators=${suggestedGalleryResources.accelerators}`,
                        suggestedGalleryResources.cpus &&
                          `cpus=${suggestedGalleryResources.cpus}`,
                        suggestedGalleryResources.memory &&
                          `memory=${suggestedGalleryResources.memory}`,
                      ]
                        .filter(Boolean)
                        .join(', ')}
                    </Typography>
                  )}
                  <Stack direction="row" spacing={1} sx={{ mt: 1 }}>
                    <Button
                      size="sm"
                      variant="plain"
                      color="warning"
                      onClick={() => {
                        if (!showResourceOverrides) {
                          setShowResourceOverrides(true);
                          return;
                        }
                        resourceOverridesRef.current?.scrollIntoView({
                          behavior: 'smooth',
                          block: 'nearest',
                        });
                      }}
                      disabled={isSubmitting}
                    >
                      Review resources
                    </Button>
                  </Stack>
                </Alert>
              )}

              {isSlurmProvider && (
                <SlurmFlagsSection
                  flags={jobSlurmFlags}
                  onChange={setJobSlurmFlags}
                  isSubmitting={isSubmitting}
                />
              )}
            </Stack>

            <Divider />

            <ParameterOverridesSection
              show={showParameterOverrides}
              onToggle={() => setShowParameterOverrides((prev) => !prev)}
              parameters={parameters}
              isSubmitting={isSubmitting}
              customModelDataset={customModelDataset}
              validationErrors={validationErrors}
              models={models}
              datasets={datasets}
              onValueChange={updateParameterValue}
              onValueChangeWithValidate={updateParameterValueWithValidate}
              onToggleCustomModelDataset={toggleCustomModelDataset}
            />

            <Divider />

            <TrackingSection
              useTrackio={useTrackio}
              onUseTrackioChange={setUseTrackio}
              trackioProjectName={trackioProjectName}
              onTrackioProjectNameChange={setTrackioProjectName}
              trackioProjects={trackioProjects}
              isSubmitting={isSubmitting}
            />

            <Divider />

            <ProfilingSection
              useProfiling={useProfiling}
              onUseProfilingChange={setUseProfiling}
              useProfilingTorch={useProfilingTorch}
              onUseProfilingTorchChange={setUseProfilingTorch}
              isSubmitting={isSubmitting}
            />

            <Divider />

            <SweepConfigSection
              runSweeps={runSweeps}
              onRunSweepsChange={setRunSweeps}
              sweepConfig={sweepConfig}
              onSweepConfigChange={setSweepConfig}
              sweepMetric={sweepMetric}
              onSweepMetricChange={setSweepMetric}
              lowerIsBetter={lowerIsBetter}
              onLowerIsBetterChange={setLowerIsBetter}
              parameters={parameters}
              disabled={isSubmitting}
            />

            <Divider />

            <DescriptionSection
              show={showDescription}
              onToggle={() => setShowDescription((prev) => !prev)}
              value={jobDescription}
              onChange={setJobDescription}
              isSubmitting={isSubmitting}
            />

            <Divider />

            <ResourceOverridesSection
              show={showResourceOverrides}
              onToggle={() => setShowResourceOverrides((prev) => !prev)}
              containerRef={resourceOverridesRef}
              isSubmitting={isSubmitting}
              resources={{
                cpus: cpusInput,
                memory: memoryInput,
                diskSpace: diskSpaceInput,
                accelerators: acceleratorsInput,
                numNodes: numNodesInput,
                minutesRequested: minutesRequestedInput,
              }}
              onResourceChange={handleResourceFieldChange}
              resourceOverrideMode={resourceOverrideMode}
              onResourceOverrideModeChange={handleResourceOverrideModeChange}
              providerResourceGroups={providerResourceGroups}
              selectedResourceGroupId={selectedResourceGroupId}
              onSelectResourceGroup={handleSelectResourceGroup}
              resourceGroupCustomized={resourceGroupCustomized}
              providerType={providerType}
              skypilotOverrides={skypilotOverrides}
              onSkypilotOverridesChange={setSkypilotOverrides}
              jobDstackFleetName={jobDstackFleetName}
              onJobDstackFleetNameChange={setJobDstackFleetName}
              incompatibilityAccelerators={incompatibilityAccelerators}
              resourceValidation={resourceValidation}
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button variant="plain" color="neutral" onClick={onClose}>
            Cancel
          </Button>
          <Button
            startDecorator={<PlayIcon />}
            color="success"
            onClick={handleSubmit}
            loading={isSubmitting}
            disabled={!selectedProviderId || isSubmitting}
          >
            Queue task
          </Button>
          {isSubmitting && (
            <Typography level="body-sm" sx={{ ml: 1 }}>
              {loadingMessages[loadingMessageIndex]}
            </Typography>
          )}
        </DialogActions>
      </ModalDialog>
    </Modal>
  );
}
