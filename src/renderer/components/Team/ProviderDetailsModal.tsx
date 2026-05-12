/* eslint-disable react/prop-types */
/* eslint-disable react/require-default-props */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Box,
  Button,
  Card,
  CircularProgress,
  Input,
  Modal,
  ModalDialog,
  Select,
  Typography,
  Option,
  DialogTitle,
  DialogContent,
  DialogActions,
  FormControl,
  FormLabel,
  FormHelperText,
  Textarea,
  Chip,
} from '@mui/joy';
import { useAPI, useAuth } from 'renderer/lib/authContext';
import { getPath } from 'renderer/lib/api-client/urls';
import { Endpoints } from 'renderer/lib/api-client/endpoints';
import { useNotification } from 'renderer/components/Shared/NotificationSystem';
import ProviderTypePicker, {
  ProviderTypeOption,
} from './providerForms/ProviderTypePicker';
import ProviderTypeLogo from './providerForms/ProviderTypeLogo';
import SlurmProviderFields from './providerForms/SlurmProviderFields';
import SkypilotProviderFields from './providerForms/SkypilotProviderFields';
import DstackProviderFields from './providerForms/DstackProviderFields';
import RunpodProviderFields from './providerForms/RunpodProviderFields';
import VastAiProviderFields from './providerForms/VastAiProviderFields';
import AwsProviderFields from './providerForms/AwsProviderFields';
import GcpProviderFields from './providerForms/GcpProviderFields';
import AzureProviderFields from './providerForms/AzureProviderFields';
import LocalProviderFields from './providerForms/LocalProviderFields';

interface ProviderDetailsModalProps {
  open: boolean;
  onClose: () => void;
  teamId: string;
  providerId?: string;
  hasLocalProvider?: boolean;
}

const ACCELERATOR_OPTIONS = ['AppleSilicon', 'NVIDIA', 'AMD', 'cpu'];

// Default configurations for each provider type (excluding supported_accelerators,
// which is managed via the dedicated UI field).
const DEFAULT_CONFIGS = {
  skypilot: `{
  "server_url": "<Your SkyPilot server URL e.g. http://localhost:46580>",
  "default_env_vars": {
    "SKYPILOT_USER_ID": "<Your SkyPilot user ID>",
    "SKYPILOT_USER": "<Your SkyPilot user name>"
  },
  "default_entrypoint_run": ""
}`,
  slurm: `{
  "mode": "ssh",
  "ssh_host": "<Machine IP for the SLURM login node>",
  "ssh_user": "<Your SLURM user ID - all jobs will run as this user>",
  "ssh_key_path": "",
  "ssh_port": 22
}`,
  runpod: `{
  "api_base_url": "https://rest.runpod.io/v1"
}`,
  dstack: `{
  "server_url": "<Your dstack server URL e.g. http://0.0.0.0:3000>",
  "dstack_project": "<Your dstack project name e.g. main>"
}`,
  local: `{}`,
  azure: `{
  "azure_location": "eastus"
}`,
  aws: `{
  "region": "us-east-1"
}`,
  vastai: `{}`,
  gcp: `{
  "region": "us-central1"
}`,
} as const;

const DEFAULT_SUPPORTED_ACCELERATORS: Record<string, string[]> = {
  skypilot: ['NVIDIA'],
  slurm: ['NVIDIA'],
  runpod: ['NVIDIA'],
  dstack: ['NVIDIA'],
  local: ['AppleSilicon', 'cpu'],
  azure: ['NVIDIA'],
  aws: ['NVIDIA'],
  vastai: ['NVIDIA'],
  gcp: ['NVIDIA'],
};

export default function ProviderDetailsModal({
  open,
  onClose,
  teamId,
  providerId,
  hasLocalProvider = false,
}: ProviderDetailsModalProps) {
  const [name, setName] = useState('');
  const [nameError, setNameError] = useState<string | null>(null);
  const [type, setType] = useState('');
  const [config, setConfig] = useState('');
  const [loading, setLoading] = useState(false);
  const [isSetupInProgress, setIsSetupInProgress] = useState(false);
  const [setupStatus, setSetupStatus] = useState<string | null>(null);
  const [setupLogTail, setSetupLogTail] = useState<string>('');
  const { addNotification } = useNotification();
  const [supportedAccelerators, setSupportedAccelerators] = useState<string[]>(
    [],
  );
  const [preTaskHook, setPreTaskHook] = useState<string>('');
  const [postTaskHook, setPostTaskHook] = useState<string>('');
  const [preSetupHook, setPreSetupHook] = useState<string>('');
  const [postSetupHook, setPostSetupHook] = useState<string>('');
  const [forceRefresh, setForceRefresh] = useState(false);

  // SLURM-specific form fields
  const [slurmMode, setSlurmMode] = useState<'ssh' | 'rest'>('ssh');
  const [slurmSshHost, setSlurmSshHost] = useState('');
  const [slurmSshUser, setSlurmSshUser] = useState('');
  const [slurmSshPort, setSlurmSshPort] = useState('22');
  const [slurmSshKeyPath, setSlurmSshKeyPath] = useState('');
  const [slurmRestUrl, setSlurmRestUrl] = useState('');
  const [slurmApiToken, setSlurmApiToken] = useState('');
  const [slurmApiTokenChanged, setSlurmApiTokenChanged] = useState(false);

  // SkyPilot-specific form fields
  const [skypilotServerUrl, setSkypilotServerUrl] = useState('');
  const [skypilotUserId, setSkypilotUserId] = useState('');
  const [skypilotUserName, setSkypilotUserName] = useState('');
  const [skypilotDockerImage, setSkypilotDockerImage] = useState('');
  const [skypilotDefaultRegion, setSkypilotDefaultRegion] = useState('');
  const [skypilotDefaultZone, setSkypilotDefaultZone] = useState('');
  const [skypilotUseSpot, setSkypilotUseSpot] = useState(false);
  const [dstackServerUrl, setDstackServerUrl] = useState('');
  const [dstackApiToken, setDstackApiToken] = useState('');
  const [dstackApiTokenChanged, setDstackApiTokenChanged] = useState(false);
  const [dstackProjectName, setDstackProjectName] = useState('');

  // RunPod-specific form fields
  const [runpodApiKey, setRunpodApiKey] = useState('');
  const [runpodApiKeyChanged, setRunpodApiKeyChanged] = useState(false);
  const [runpodApiBaseUrl, setRunpodApiBaseUrl] = useState('');

  // Azure-specific form fields
  const [azureSubscriptionId, setAzureSubscriptionId] = useState('');
  const [azureTenantId, setAzureTenantId] = useState('');
  const [azureClientId, setAzureClientId] = useState('');
  const [azureClientSecret, setAzureClientSecret] = useState('');
  const [azureClientSecretChanged, setAzureClientSecretChanged] =
    useState(false);
  const [azureLocation, setAzureLocation] = useState('eastus');

  // AWS-specific form fields
  const [awsRegion, setAwsRegion] = useState('us-east-1');
  const [awsAccessKeyId, setAwsAccessKeyId] = useState('');
  const [awsSecretAccessKey, setAwsSecretAccessKey] = useState('');

  // Vast.ai-specific form fields
  const [vastAiApiKey, setVastAiApiKey] = useState('');
  const [vastAiApiKeyChanged, setVastAiApiKeyChanged] = useState(false);
  // GCP-specific form fields
  const [gcpRegion, setGcpRegion] = useState('us-central1');
  const [gcpZone, setGcpZone] = useState('');
  const [gcpServiceAccountJson, setGcpServiceAccountJson] = useState('');

  const { fetchWithAuth } = useAuth();
  const { data: providerData, isLoading: providerDataLoading } = useAPI(
    'compute_provider',
    ['get'],
    {
      providerId,
    },
    {
      skip: !providerId,
    },
  );

  const providerTypeOptions = useMemo<ProviderTypeOption[]>(() => {
    const baseOptions: ProviderTypeOption[] = [
      {
        value: 'skypilot',
        label: 'SkyPilot',
        description: 'Remote cloud orchestration through a SkyPilot server.',
      },
      {
        value: 'slurm',
        label: 'SLURM',
        description: 'Use a SLURM cluster through SSH or REST.',
      },
      {
        value: 'runpod',
        label: 'Runpod',
        description: 'Run workloads on Runpod infrastructure.',
      },
      {
        value: 'dstack',
        label: 'dstack',
        description: 'Connect to your dstack control plane.',
      },
      {
        value: 'aws',
        label: 'AWS (beta)',
        description: 'Launch and manage compute on AWS.',
      },
      {
        value: 'vastai',
        label: 'Vast.ai (beta)',
        description: 'Rent GPU instances from the Vast.ai marketplace.',
      },
      {
        value: 'gcp',
        label: 'GCP (beta)',
        description: 'Launch and manage compute on Google Cloud.',
      },
      {
        value: 'azure',
        label: 'Azure (beta)',
        description: 'Launch and manage compute on Azure.',
      },
    ];

    if (!hasLocalProvider || providerId) {
      baseOptions.push({
        value: 'local',
        label: 'Local',
        description: 'Run jobs on this machine using local resources.',
      });
    }

    return baseOptions;
  }, [hasLocalProvider, providerId]);

  const providerConfigObject = useMemo(() => {
    if (!providerId) return {};
    return typeof providerData?.config === 'string'
      ? (() => {
          try {
            return JSON.parse(providerData.config);
          } catch {
            return {};
          }
        })()
      : providerData?.config || {};
  }, [providerData?.config, providerId]);

  const awsProfile = useMemo(
    () => providerConfigObject?.aws_profile,
    [providerConfigObject],
  );

  const gcpServiceAccountEmail = useMemo(
    () => providerConfigObject?.service_account_email,
    [providerConfigObject],
  );

  // Helper to parse config and extract SkyPilot fields
  const parseSkypilotConfig = (configObj: any) => {
    if (configObj && typeof configObj === 'object') {
      setSkypilotServerUrl(configObj.server_url || '');
      const envVars = configObj.default_env_vars || {};
      setSkypilotUserId(envVars.SKYPILOT_USER_ID || '');
      setSkypilotUserName(envVars.SKYPILOT_USER || '');
      setSkypilotDockerImage(configObj.docker_image || '');
      setSkypilotDefaultRegion(configObj.default_region || '');
      setSkypilotDefaultZone(configObj.default_zone || '');
      setSkypilotUseSpot(configObj.use_spot === true);
      if (configObj.supported_accelerators) {
        setSupportedAccelerators(configObj.supported_accelerators);
      }
    }
  };

  // Helper to build SkyPilot config from form fields
  const buildSkypilotConfig = useCallback(() => {
    const configObj: any = {
      server_url: skypilotServerUrl,
      default_env_vars: {} as Record<string, string>,
    };
    if (skypilotUserId) {
      configObj.default_env_vars.SKYPILOT_USER_ID = skypilotUserId;
    }
    if (skypilotUserName) {
      configObj.default_env_vars.SKYPILOT_USER = skypilotUserName;
    }
    if (skypilotDockerImage) {
      configObj.docker_image = skypilotDockerImage;
    }
    if (skypilotDefaultRegion) {
      configObj.default_region = skypilotDefaultRegion;
    }
    if (skypilotDefaultZone) {
      configObj.default_zone = skypilotDefaultZone;
    }
    if (skypilotUseSpot) {
      configObj.use_spot = true;
    }
    if (supportedAccelerators && supportedAccelerators.length > 0) {
      configObj.supported_accelerators = supportedAccelerators;
    }
    return configObj;
  }, [
    skypilotServerUrl,
    skypilotUserId,
    skypilotUserName,
    skypilotDockerImage,
    skypilotDefaultRegion,
    skypilotDefaultZone,
    skypilotUseSpot,
    supportedAccelerators,
  ]);

  // Helper to parse config and extract SLURM fields
  const parseSlurmConfig = (configObj: any) => {
    if (configObj && typeof configObj === 'object') {
      setSlurmMode(configObj.mode === 'rest' ? 'rest' : 'ssh');
      setSlurmSshHost(configObj.ssh_host || '');
      setSlurmSshUser(configObj.ssh_user || '');
      setSlurmSshPort(String(configObj.ssh_port || 22));
      setSlurmSshKeyPath(configObj.ssh_key_path || '');
      setSlurmRestUrl(configObj.rest_url || '');
      setSlurmApiToken(
        configObj.api_token === '***' ? '' : configObj.api_token || '',
      );
      setSlurmApiTokenChanged(false);
      if (configObj.supported_accelerators) {
        setSupportedAccelerators(configObj.supported_accelerators);
      }
    }
  };

  // Helper to build SLURM config from form fields
  const buildSlurmConfig = useCallback(() => {
    const configObj: any = {
      mode: slurmMode,
    };

    if (slurmMode === 'ssh') {
      configObj.ssh_host = slurmSshHost;
      configObj.ssh_user = slurmSshUser;
      configObj.ssh_port = parseInt(slurmSshPort, 10) || 22;
      if (slurmSshKeyPath) {
        configObj.ssh_key_path = slurmSshKeyPath;
      }
    } else {
      configObj.rest_url = slurmRestUrl;
      if (!providerId || slurmApiTokenChanged) {
        configObj.api_token = slurmApiToken;
      }
      // REST mode still uses ssh_user for X-SLURM-USER-NAME header
      if (slurmSshUser) {
        configObj.ssh_user = slurmSshUser;
      }
    }

    if (supportedAccelerators && supportedAccelerators.length > 0) {
      configObj.supported_accelerators = supportedAccelerators;
    }

    return configObj;
  }, [
    slurmMode,
    slurmSshHost,
    slurmSshUser,
    slurmSshPort,
    slurmSshKeyPath,
    slurmRestUrl,
    slurmApiToken,
    slurmApiTokenChanged,
    supportedAccelerators,
    providerId,
  ]);

  const parseDstackConfig = (configObj: any) => {
    if (configObj && typeof configObj === 'object') {
      setDstackServerUrl(configObj.server_url || '');
      setDstackApiToken(
        configObj.api_token === '***' ? '' : configObj.api_token || '',
      );
      setDstackApiTokenChanged(false);
      setDstackProjectName(configObj.dstack_project || '');
      if (configObj.supported_accelerators) {
        setSupportedAccelerators(configObj.supported_accelerators);
      }
    }
  };

  const buildDstackConfig = useCallback(() => {
    const configObj: any = {
      server_url: dstackServerUrl,
      dstack_project: dstackProjectName,
    };
    if (!providerId || dstackApiTokenChanged) {
      configObj.api_token = dstackApiToken;
    }
    if (supportedAccelerators && supportedAccelerators.length > 0) {
      configObj.supported_accelerators = supportedAccelerators;
    }
    return configObj;
  }, [
    dstackServerUrl,
    dstackApiToken,
    dstackApiTokenChanged,
    dstackProjectName,
    supportedAccelerators,
    providerId,
  ]);

  const parseRunpodConfig = (configObj: any) => {
    if (configObj && typeof configObj === 'object') {
      setRunpodApiKey(
        configObj.api_key === '***' ? '' : configObj.api_key || '',
      );
      setRunpodApiKeyChanged(false);
      setRunpodApiBaseUrl(configObj.api_base_url || '');
      if (configObj.supported_accelerators) {
        setSupportedAccelerators(configObj.supported_accelerators);
      }
    }
  };

  const parseAzureConfig = (configObj: any) => {
    if (configObj && typeof configObj === 'object') {
      setAzureSubscriptionId(configObj.azure_subscription_id || '');
      setAzureTenantId(configObj.azure_tenant_id || '');
      setAzureClientId(configObj.azure_client_id || '');
      setAzureClientSecret(
        configObj.azure_client_secret === '***'
          ? ''
          : configObj.azure_client_secret || '',
      );
      setAzureClientSecretChanged(false);
      setAzureLocation(configObj.azure_location || 'eastus');
      if (configObj.supported_accelerators) {
        setSupportedAccelerators(configObj.supported_accelerators);
      }
    }
  };

  const buildRunpodConfig = useCallback(() => {
    const configObj: any = {
      api_base_url: runpodApiBaseUrl || 'https://rest.runpod.io/v1',
    };
    if (!providerId || runpodApiKeyChanged) {
      configObj.api_key = runpodApiKey;
    }
    if (supportedAccelerators && supportedAccelerators.length > 0) {
      configObj.supported_accelerators = supportedAccelerators;
    }
    return configObj;
  }, [
    runpodApiKey,
    runpodApiKeyChanged,
    runpodApiBaseUrl,
    supportedAccelerators,
    providerId,
  ]);

  const buildAzureConfig = useCallback(() => {
    const configObj: any = {
      azure_subscription_id: azureSubscriptionId,
      azure_tenant_id: azureTenantId,
      azure_client_id: azureClientId,
      azure_location: azureLocation,
    };
    if (!providerId || azureClientSecretChanged) {
      configObj.azure_client_secret = azureClientSecret;
    }

    if (supportedAccelerators.length > 0) {
      configObj.supported_accelerators = supportedAccelerators;
    }
    return configObj;
  }, [
    azureSubscriptionId,
    azureTenantId,
    azureClientId,
    azureClientSecret,
    azureClientSecretChanged,
    azureLocation,
    supportedAccelerators,
    providerId,
  ]);

  const parseAwsConfig = (configObj: any) => {
    if (configObj && typeof configObj === 'object') {
      setAwsRegion(configObj.region || 'us-east-1');
      if (configObj.supported_accelerators) {
        setSupportedAccelerators(configObj.supported_accelerators);
      }
    }
  };

  const buildAwsConfig = useCallback(() => {
    const configObj: any = { region: awsRegion };
    if (supportedAccelerators.length > 0) {
      configObj.supported_accelerators = supportedAccelerators;
    }
    return configObj;
  }, [awsRegion, supportedAccelerators]);

  const parseVastAiConfig = (configObj: any) => {
    if (configObj && typeof configObj === 'object') {
      setVastAiApiKey(
        configObj.api_key === '***' ? '' : configObj.api_key || '',
      );
      setVastAiApiKeyChanged(false);
      if (configObj.supported_accelerators) {
        setSupportedAccelerators(configObj.supported_accelerators);
      }
    }
  };

  const parseGcpConfig = (configObj: any) => {
    if (configObj && typeof configObj === 'object') {
      const inferredRegion =
        configObj.region ||
        (typeof configObj.zone === 'string' && configObj.zone.includes('-')
          ? configObj.zone.split('-').slice(0, 2).join('-')
          : '');
      setGcpRegion(inferredRegion || 'us-central1');
      setGcpZone(configObj.zone || '');
      if (configObj.supported_accelerators) {
        setSupportedAccelerators(configObj.supported_accelerators);
      }
    }
  };

  const buildVastAiConfig = useCallback(() => {
    const configObj: any = {};
    if (!providerId || vastAiApiKeyChanged) {
      configObj.api_key = vastAiApiKey;
    }
    if (supportedAccelerators.length > 0) {
      configObj.supported_accelerators = supportedAccelerators;
    }
    return configObj;
  }, [vastAiApiKey, vastAiApiKeyChanged, supportedAccelerators, providerId]);

  const buildGcpConfig = useCallback(() => {
    const configObj: any = {
      region: gcpRegion.trim(),
    };
    if (gcpZone.trim()) {
      configObj.zone = gcpZone.trim();
    }
    if (supportedAccelerators.length > 0) {
      configObj.supported_accelerators = supportedAccelerators;
    }
    return configObj;
  }, [gcpRegion, gcpZone, supportedAccelerators]);

  // if a providerId is passed then we are editing an existing provider
  // Otherwise we are creating a new provider
  useEffect(() => {
    if (providerId && providerData) {
      setName(providerData.name || '');
      setNameError(null);
      setType(providerData.type || '');
      // Config is an object, stringify it for display in textarea
      const rawConfigObj =
        typeof providerData.config === 'string'
          ? JSON.parse(providerData.config || '{}')
          : providerData.config || {};

      const extraConfig =
        rawConfigObj && typeof rawConfigObj === 'object'
          ? rawConfigObj.extra_config || {}
          : {};
      if (extraConfig && typeof extraConfig === 'object') {
        setPreTaskHook(extraConfig.pre_task_hook || '');
        setPostTaskHook(extraConfig.post_task_hook || '');
        setPreSetupHook(extraConfig.pre_setup_hook || '');
        setPostSetupHook(extraConfig.post_setup_hook || '');
      } else {
        setPreTaskHook('');
        setPostTaskHook('');
        setPreSetupHook('');
        setPostSetupHook('');
      }

      // Extract supported_accelerators into dedicated state, but do not show it in raw JSON.
      if (rawConfigObj.supported_accelerators) {
        setSupportedAccelerators(rawConfigObj.supported_accelerators);
        delete rawConfigObj.supported_accelerators;
      }

      // Parse SLURM-specific fields if this is a SLURM provider
      if (providerData.type === 'slurm') {
        parseSlurmConfig(rawConfigObj);
      }
      // Parse SkyPilot-specific fields if this is a SkyPilot provider
      if (providerData.type === 'skypilot') {
        parseSkypilotConfig(rawConfigObj);
      }
      if (providerData.type === 'dstack') {
        parseDstackConfig(rawConfigObj);
      }
      if (providerData.type === 'runpod') {
        parseRunpodConfig(rawConfigObj);
      }
      if (providerData.type === 'azure') {
        parseAzureConfig(rawConfigObj);
      }
      if (providerData.type === 'aws') {
        parseAwsConfig(rawConfigObj);
      }
      if (providerData.type === 'vastai') {
        parseVastAiConfig(rawConfigObj);
      }
      if (providerData.type === 'gcp') {
        parseGcpConfig(rawConfigObj);
      }
      setConfig(JSON.stringify(rawConfigObj, null, 2));
    } else if (!providerId) {
      // Reset form when in "add" mode (no providerId)
      setName('');
      setNameError(null);
      setType('');
      setConfig('');
      setSupportedAccelerators([]);
      setPreTaskHook('');
      setPostTaskHook('');
      setPreSetupHook('');
      setPostSetupHook('');
      setSlurmMode('ssh');
      setSlurmSshHost('');
      setSlurmSshUser('');
      setSlurmSshPort('22');
      setSlurmSshKeyPath('');
      setSlurmRestUrl('');
      setSlurmApiToken('');
      setSlurmApiTokenChanged(false);
      setSkypilotServerUrl('');
      setSkypilotUserId('');
      setSkypilotUserName('');
      setSkypilotDockerImage('');
      setSkypilotDefaultRegion('');
      setSkypilotDefaultZone('');
      setSkypilotUseSpot(false);
      setDstackServerUrl('');
      setDstackApiToken('');
      setDstackApiTokenChanged(false);
      setDstackProjectName('');
      setRunpodApiKey('');
      setRunpodApiKeyChanged(false);
      setRunpodApiBaseUrl('');
      setAzureSubscriptionId('');
      setAzureTenantId('');
      setAzureClientId('');
      setAzureClientSecret('');
      setAzureClientSecretChanged(false);
      setAzureLocation('eastus');
      setAwsRegion('us-east-1');
      setAwsAccessKeyId('');
      setAwsSecretAccessKey('');
      setVastAiApiKey('');
      setVastAiApiKeyChanged(false);
      setGcpRegion('us-central1');
      setGcpZone('');
      setGcpServiceAccountJson('');
    }
  }, [providerId, providerData]);

  // Reset form when modal closes
  useEffect(() => {
    if (!open) {
      setName('');
      setNameError(null);
      setType('');
      setConfig('');
      setSupportedAccelerators([]);
      setPreTaskHook('');
      setPostTaskHook('');
      setPreSetupHook('');
      setPostSetupHook('');
      setSlurmMode('ssh');
      setSlurmSshHost('');
      setSlurmSshUser('');
      setSlurmSshPort('22');
      setSlurmSshKeyPath('');
      setSlurmRestUrl('');
      setSlurmApiToken('');
      setSlurmApiTokenChanged(false);
      setSkypilotServerUrl('');
      setSkypilotUserId('');
      setSkypilotUserName('');
      setSkypilotDockerImage('');
      setSkypilotDefaultRegion('');
      setSkypilotDefaultZone('');
      setSkypilotUseSpot(false);
      setDstackServerUrl('');
      setDstackApiToken('');
      setDstackApiTokenChanged(false);
      setDstackProjectName('');
      setIsSetupInProgress(false);
      setSetupStatus(null);
      setSetupLogTail('');
      setRunpodApiKey('');
      setRunpodApiKeyChanged(false);
      setRunpodApiBaseUrl('');
      setAzureSubscriptionId('');
      setAzureTenantId('');
      setAzureClientId('');
      setAzureClientSecret('');
      setAzureClientSecretChanged(false);
      setAzureLocation('eastus');
      setAwsRegion('us-east-1');
      setAwsAccessKeyId('');
      setAwsSecretAccessKey('');
      setVastAiApiKey('');
      setVastAiApiKeyChanged(false);
      setGcpRegion('us-central1');
      setGcpZone('');
      setGcpServiceAccountJson('');
    }
  }, [open]);

  // Populate default config when provider type changes (only when adding new provider)
  useEffect(() => {
    if (!providerId && type && type in DEFAULT_CONFIGS) {
      const defaultConfig =
        DEFAULT_CONFIGS[type as keyof typeof DEFAULT_CONFIGS];
      setConfig(defaultConfig);

      // Initialize default supported accelerators per provider type, but keep them
      // out of the raw JSON configuration.
      if (type === 'local') {
        // Optimistic defaults while we query the backend for real detection.
        setSupportedAccelerators(DEFAULT_SUPPORTED_ACCELERATORS.local || []);

        let cancelled = false;
        const detectLocal = async () => {
          try {
            const response = await fetchWithAuth(
              Endpoints.ComputeProvider.DetectLocalAccelerators(),
              { method: 'GET' },
            );
            if (!response.ok) return;
            const data = await response.json().catch(() => ({}));
            const detected = data.supported_accelerators;
            if (!cancelled && Array.isArray(detected)) {
              setSupportedAccelerators(detected);
            }
          } catch (e) {
            // Best-effort: keep the optimistic defaults if detection fails.
            // eslint-disable-next-line no-console
            console.error('Failed to detect local accelerators:', e);
          }
        };
        detectLocal();

        return () => {
          cancelled = true;
        };
      }

      if (DEFAULT_SUPPORTED_ACCELERATORS[type]) {
        setSupportedAccelerators(DEFAULT_SUPPORTED_ACCELERATORS[type]);
      } else {
        setSupportedAccelerators([]);
      }

      // Parse SLURM defaults from the JSON template
      if (type === 'slurm') {
        try {
          const configObj = JSON.parse(defaultConfig);
          parseSlurmConfig(configObj);
        } catch (e) {
          // Ignore parse errors
        }
      }

      // Parse SkyPilot defaults from the JSON template
      if (type === 'skypilot') {
        try {
          const configObj = JSON.parse(defaultConfig);
          parseSkypilotConfig(configObj);
        } catch (e) {
          // Ignore parse errors
        }
      }
      if (type === 'dstack') {
        try {
          const configObj = JSON.parse(defaultConfig);
          parseDstackConfig(configObj);
        } catch (e) {
          // Ignore parse errors
        }
      }
      if (type === 'runpod') {
        try {
          const configObj = JSON.parse(defaultConfig);
          parseRunpodConfig(configObj);
        } catch (e) {
          // Ignore parse errors
        }
      }
      if (type === 'azure') {
        try {
          const configObj = JSON.parse(defaultConfig);
          parseAzureConfig(configObj);
        } catch (e) {
          // Ignore parse errors
        }
      }

      if (type === 'aws') {
        try {
          const configObj = JSON.parse(DEFAULT_CONFIGS.aws);
          parseAwsConfig(configObj);
        } catch (e) {
          // Ignore parse errors
        }
      }
      if (type === 'vastai') {
        try {
          const configObj = JSON.parse(defaultConfig);
          parseVastAiConfig(configObj);
        } catch (e) {
          // Ignore parse errors
        }
      }
      if (type === 'gcp') {
        try {
          const configObj = JSON.parse(DEFAULT_CONFIGS.gcp);
          parseGcpConfig(configObj);
        } catch (e) {
          // Ignore parse errors
        }
      }
    }
    return undefined;
  }, [type, providerId, fetchWithAuth]);

  // Update config JSON when form fields change
  useEffect(() => {
    if (!providerId) {
      // Only auto-update when creating new provider, not editing
      if (type === 'slurm') {
        const configObj = buildSlurmConfig();
        setConfig(JSON.stringify(configObj, null, 2));
      }
      if (type === 'skypilot') {
        const configObj = buildSkypilotConfig();
        setConfig(JSON.stringify(configObj, null, 2));
      }
      if (type === 'dstack') {
        const configObj = buildDstackConfig();
        setConfig(JSON.stringify(configObj, null, 2));
      }
      if (type === 'runpod') {
        const configObj = buildRunpodConfig();
        setConfig(JSON.stringify(configObj, null, 2));
      }
      if (type === 'azure') {
        const configObj = buildAzureConfig();
        setConfig(JSON.stringify(configObj, null, 2));
      }

      if (type === 'aws') {
        const configObj = buildAwsConfig();
        setConfig(JSON.stringify(configObj, null, 2));
      }
      if (type === 'vastai') {
        const configObj = buildVastAiConfig();
        setConfig(JSON.stringify(configObj, null, 2));
      }
      if (type === 'gcp') {
        const configObj = buildGcpConfig();
        setConfig(JSON.stringify(configObj, null, 2));
      }
    }
  }, [
    buildSlurmConfig,
    buildSkypilotConfig,
    buildDstackConfig,
    buildRunpodConfig,
    buildAzureConfig,
    buildAwsConfig,
    buildVastAiConfig,
    buildGcpConfig,
    type,
    providerId,
  ]);

  // Local provider setup: poll background setup status and keep modal open until done.
  const pollLocalSetupStatus = (providerIdForSetup: string) => {
    const poll = async () => {
      try {
        const response = await fetchWithAuth(
          Endpoints.ComputeProvider.SetupStatus(providerIdForSetup),
          { method: 'GET' },
        );
        if (!response.ok) {
          const error = await response.json().catch(() => ({}));
          const detail =
            (error &&
              (error.detail?.message || error.detail || error.message)) ||
            'Unknown error';
          setSetupStatus(`Failed to read setup status: ${detail}`);
          setIsSetupInProgress(false);
          addNotification({
            type: 'danger',
            message: 'Local provider setup failed to report status.',
          });
          return;
        }

        const data = await response.json().catch(() => ({}));

        // If status is idle and done, treat as "already finished" and close quietly.
        if (data.status === 'idle' && data.done) {
          setIsSetupInProgress(false);
          onClose();
          return;
        }

        const message: string =
          data.message ||
          data.error ||
          (data.done
            ? 'Local provider setup finished.'
            : 'Running local provider setup…');

        setSetupStatus(message);
        setSetupLogTail(typeof data.log_tail === 'string' ? data.log_tail : '');

        if (!data.done) {
          window.setTimeout(poll, 2000);
        } else {
          setIsSetupInProgress(false);
          addNotification({
            type: data.error ? 'danger' : 'success',
            message,
          });
          onClose();
        }
      } catch {
        setSetupStatus('Failed to read setup status. Please try again.');
        setIsSetupInProgress(false);
        addNotification({
          type: 'danger',
          message: 'Local provider setup failed to report status.',
        });
      }
    };

    setIsSetupInProgress(true);
    setSetupStatus('Starting local provider setup…');
    setSetupLogTail('');
    poll();
  };

  function createProvider(
    providerName: string,
    providerType: string,
    providerConfig: any,
    forceRefreshFlag: boolean = false,
  ) {
    const basePath = getPath('compute_provider', ['create'], { teamId });
    const url =
      providerType === 'local'
        ? `${basePath}?force_refresh=${forceRefreshFlag}`
        : basePath;
    return fetchWithAuth(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: providerName,
        type: providerType,
        config: providerConfig,
      }),
    });
  }

  function updateProvider(
    id: string,
    providerName: string,
    providerConfig: any,
  ) {
    return fetchWithAuth(
      getPath('compute_provider', ['update'], { providerId: id, teamId }),
      {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ name: providerName, config: providerConfig }),
      },
    );
  }

  function saveAwsCredentials(
    providerIdToSave: string,
    accessKeyId: string,
    secretAccessKey: string,
  ) {
    return fetchWithAuth(
      Endpoints.ComputeProvider.AwsCredentials(providerIdToSave),
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          access_key_id: accessKeyId,
          secret_access_key: secretAccessKey,
        }),
      },
    );
  }

  function saveGcpCredentials(
    providerIdToSave: string,
    serviceAccountJson: string,
  ) {
    return fetchWithAuth(
      Endpoints.ComputeProvider.GcpCredentials(providerIdToSave),
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          service_account_json: serviceAccountJson,
        }),
      },
    );
  }

  const saveProvider = async () => {
    const trimmedName = name.trim();
    if (!trimmedName) {
      setNameError('A name is required.');
      return;
    }
    setNameError(null);

    setLoading(true);
    try {
      // For SLURM and SkyPilot providers, build config from form fields
      let parsedConfig: any;
      if (type === 'slurm') {
        parsedConfig = buildSlurmConfig();
      } else if (type === 'skypilot') {
        parsedConfig = buildSkypilotConfig();
      } else if (type === 'dstack') {
        parsedConfig = buildDstackConfig();
      } else if (type === 'runpod') {
        parsedConfig = buildRunpodConfig();
      } else if (type === 'azure') {
        parsedConfig = buildAzureConfig();
      } else if (type === 'aws') {
        parsedConfig = buildAwsConfig();
      } else if (type === 'vastai') {
        parsedConfig = buildVastAiConfig();
      } else if (type === 'gcp') {
        parsedConfig = buildGcpConfig();
      } else if (type === 'local') {
        // Local providers are configured via supported accelerators only
        parsedConfig = {};
        if (supportedAccelerators.length > 0) {
          parsedConfig.supported_accelerators = supportedAccelerators;
        }
      } else {
        // The API expects an object for config, not a JSON string
        parsedConfig = typeof config === 'string' ? JSON.parse(config) : config;
        // Ensure supported_accelerators from state is included if set
        if (supportedAccelerators.length > 0) {
          parsedConfig.supported_accelerators = supportedAccelerators;
        }
      }
      const trimmedAwsAccessKeyId = awsAccessKeyId.trim();
      const trimmedAwsSecretAccessKey = awsSecretAccessKey.trim();
      const hasAwsCreds = Boolean(
        trimmedAwsAccessKeyId && trimmedAwsSecretAccessKey,
      );
      const hasOnlyAccessKeyId = Boolean(
        trimmedAwsAccessKeyId && !trimmedAwsSecretAccessKey,
      );
      const hasOnlySecretAccessKey = Boolean(
        !trimmedAwsAccessKeyId && trimmedAwsSecretAccessKey,
      );
      const hasPartialAwsCreds = Boolean(
        hasOnlyAccessKeyId || hasOnlySecretAccessKey,
      );
      if (type === 'aws' && hasPartialAwsCreds) {
        addNotification({
          type: 'danger',
          message:
            'Enter both AWS Access Key ID and Secret Access Key, or leave both blank.',
        });
        return;
      }

      const trimmedGcpServiceAccountJson = gcpServiceAccountJson.trim();
      const trimmedGcpRegion = gcpRegion.trim();
      if (type === 'gcp' && !trimmedGcpRegion) {
        addNotification({
          type: 'danger',
          message: 'GCP region is required.',
        });
        return;
      }
      if (type === 'gcp' && !providerId && !trimmedGcpServiceAccountJson) {
        addNotification({
          type: 'danger',
          message:
            'Paste a GCP service account JSON key to create a GCP provider.',
        });
        return;
      }

      if (
        !parsedConfig.extra_config ||
        typeof parsedConfig.extra_config !== 'object'
      ) {
        parsedConfig.extra_config = {};
      }
      if (preTaskHook.trim()) {
        parsedConfig.extra_config.pre_task_hook = preTaskHook;
      } else {
        delete parsedConfig.extra_config.pre_task_hook;
      }
      if (postTaskHook.trim()) {
        parsedConfig.extra_config.post_task_hook = postTaskHook;
      } else {
        delete parsedConfig.extra_config.post_task_hook;
      }
      if (preSetupHook.trim()) {
        parsedConfig.extra_config.pre_setup_hook = preSetupHook;
      } else {
        delete parsedConfig.extra_config.pre_setup_hook;
      }
      if (postSetupHook.trim()) {
        parsedConfig.extra_config.post_setup_hook = postSetupHook;
      } else {
        delete parsedConfig.extra_config.post_setup_hook;
      }
      if (Object.keys(parsedConfig.extra_config).length === 0) {
        delete parsedConfig.extra_config;
      }

      const response = providerId
        ? await updateProvider(providerId, trimmedName, parsedConfig)
        : await createProvider(trimmedName, type, parsedConfig, forceRefresh);

      if (response.ok) {
        const data = await response.json().catch(() => ({}));
        const savedProviderId = providerId || String(data?.id || '');

        if (type === 'aws' && hasAwsCreds) {
          if (!savedProviderId) {
            addNotification({
              type: 'danger',
              message:
                'Provider was saved, but could not determine provider ID to save AWS credentials.',
            });
            return;
          }
          const awsCredsResponse = await saveAwsCredentials(
            savedProviderId,
            trimmedAwsAccessKeyId,
            trimmedAwsSecretAccessKey,
          );
          if (!awsCredsResponse.ok) {
            addNotification({
              type: 'danger',
              message:
                'Provider was saved, but saving AWS credentials failed. Open the provider and try again.',
            });
            return;
          }
        }

        if (type === 'gcp' && trimmedGcpServiceAccountJson) {
          if (!savedProviderId) {
            addNotification({
              type: 'danger',
              message:
                'Provider was saved, but could not determine provider ID to save GCP credentials.',
            });
            return;
          }
          const gcpCredsResponse = await saveGcpCredentials(
            savedProviderId,
            trimmedGcpServiceAccountJson,
          );
          if (!gcpCredsResponse.ok) {
            const errorData = await gcpCredsResponse.json().catch(() => ({}));
            addNotification({
              type: 'danger',
              message:
                errorData?.detail ||
                'Provider was saved, but saving GCP credentials failed. Open the provider and try again.',
            });
            return;
          }
        }

        // For newly created LOCAL providers, keep the modal open and show setup progress.
        if (!providerId && type === 'local') {
          const newId = String(data?.id || '');
          if (newId) {
            pollLocalSetupStatus(newId);
            return;
          }
        }

        setName('');
        setConfig('');
        onClose();
      } else {
        const errorData = await response.json().catch(() => ({}));
        // eslint-disable-next-line no-console
        console.error('Error updating provider:', errorData);
        let message = 'Could not save compute provider.';
        const { detail } = errorData as { detail?: unknown };
        let nameValidationMessage: string | null = null;
        if (typeof detail === 'string') {
          message = detail;
        } else if (Array.isArray(detail)) {
          const first = detail.find(
            (item): item is { msg?: string; loc?: unknown[] } =>
              !!item && typeof item === 'object',
          );
          if (first && typeof first.msg === 'string') {
            message = first.msg;
          }
          const nameIssue = detail.find(
            (item) =>
              item &&
              typeof item === 'object' &&
              Array.isArray((item as { loc?: unknown[] }).loc) &&
              (item as { loc: unknown[] }).loc.includes('name'),
          );
          if (
            nameIssue &&
            typeof nameIssue === 'object' &&
            typeof (nameIssue as { msg?: string }).msg === 'string'
          ) {
            nameValidationMessage = (nameIssue as { msg: string }).msg;
          }
        }
        if (nameValidationMessage) {
          setNameError(nameValidationMessage);
        }
        addNotification({ type: 'danger', message });
      }
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('Error updating provider:', error);
    } finally {
      setLoading(false);
    }
  };

  const selectedProviderTypeMeta = providerTypeOptions.find(
    (option) => option.value === type,
  );
  const selectedProviderLabel =
    selectedProviderTypeMeta?.label || 'Compute Provider';
  let dialogTitle = 'Add Compute Provider';
  if (providerId) {
    dialogTitle = 'Edit Compute Provider';
  } else if (type) {
    dialogTitle = `Add ${selectedProviderLabel}`;
  }

  return (
    <Modal open={open} onClose={onClose}>
      <ModalDialog sx={{ gap: 0, width: 600, height: 700, overflow: 'auto' }}>
        <DialogTitle>{dialogTitle}</DialogTitle>
        <DialogContent>
          {providerId && providerDataLoading ? (
            <Box
              sx={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                minHeight: 200,
                width: '100%',
              }}
            >
              <CircularProgress />
            </Box>
          ) : (
            <>
              {!providerId && !type ? (
                <ProviderTypePicker
                  options={providerTypeOptions}
                  onSelect={(selectedType) => setType(selectedType)}
                />
              ) : (
                <>
                  <FormControl sx={{ mt: 2 }}>
                    <FormLabel>Compute Provider Type</FormLabel>
                    <Card variant="soft" sx={{ mt: 1, p: 1.5 }}>
                      <Box
                        sx={{
                          display: 'flex',
                          gap: 1.25,
                          alignItems: 'flex-start',
                        }}
                      >
                        <ProviderTypeLogo providerType={type} size={48} />
                        <Box sx={{ minWidth: 0, flex: 1 }}>
                          <Typography level="title-sm">
                            {selectedProviderTypeMeta?.label ?? type}
                          </Typography>
                          {selectedProviderTypeMeta?.description ? (
                            <Typography
                              level="body-sm"
                              sx={{ mt: 0.5, color: 'text.tertiary' }}
                            >
                              {selectedProviderTypeMeta.description}
                            </Typography>
                          ) : null}
                        </Box>
                      </Box>
                    </Card>
                    {providerId ? (
                      <Typography
                        level="body-sm"
                        sx={{ mt: 0.5, color: 'text.tertiary' }}
                      >
                        Provider type cannot be changed after creation
                      </Typography>
                    ) : (
                      <Box sx={{ mt: 0.5 }}>
                        <Button
                          variant="plain"
                          size="sm"
                          onClick={() => {
                            setType('');
                            setNameError(null);
                          }}
                          disabled={loading || isSetupInProgress}
                          sx={{ px: 0 }}
                        >
                          Change
                        </Button>
                      </Box>
                    )}
                  </FormControl>
                  <FormControl required error={!!nameError} sx={{ mt: 1 }}>
                    <FormLabel>Compute Provider Name</FormLabel>
                    <Input
                      value={name}
                      onChange={(event) => {
                        setName(event.currentTarget.value);
                        setNameError(null);
                      }}
                      placeholder="Enter friendly name for compute provider"
                      fullWidth
                      color={nameError ? 'danger' : undefined}
                    />
                    {nameError ? (
                      <FormHelperText>{nameError}</FormHelperText>
                    ) : null}
                  </FormControl>
                </>
              )}

              {(providerId || type) && (
                <>
                  {type === 'local' && !providerId && (
                    <LocalProviderFields
                      forceRefresh={forceRefresh}
                      setForceRefresh={setForceRefresh}
                    />
                  )}

                  <FormControl sx={{ mt: 1 }}>
                    <FormLabel>Supported Accelerators</FormLabel>
                    <Select
                      multiple
                      value={supportedAccelerators}
                      onChange={(event, newValue) =>
                        setSupportedAccelerators(newValue)
                      }
                      renderValue={(selected) => (
                        <Box sx={{ display: 'flex', gap: '0.25rem' }}>
                          {selected.map((selectedOption) => (
                            <Chip
                              key={selectedOption.value}
                              variant="soft"
                              color="primary"
                            >
                              {selectedOption.label}
                            </Chip>
                          ))}
                        </Box>
                      )}
                      placeholder="Select supported accelerators"
                      sx={{ width: '100%' }}
                      slotProps={{
                        listbox: {
                          sx: {
                            width: '100%',
                          },
                        },
                      }}
                    >
                      {ACCELERATOR_OPTIONS.map((option) => (
                        <Option key={option} value={option}>
                          {option}
                        </Option>
                      ))}
                    </Select>
                    <Typography
                      level="body-sm"
                      sx={{ mt: 0.5, color: 'text.tertiary' }}
                    >
                      Select the types of hardware this provider supports.
                    </Typography>
                  </FormControl>

                  {type === 'slurm' && (
                    <SlurmProviderFields
                      slurmMode={slurmMode}
                      setSlurmMode={setSlurmMode}
                      slurmSshHost={slurmSshHost}
                      setSlurmSshHost={setSlurmSshHost}
                      slurmSshUser={slurmSshUser}
                      setSlurmSshUser={setSlurmSshUser}
                      slurmSshPort={slurmSshPort}
                      setSlurmSshPort={setSlurmSshPort}
                      slurmSshKeyPath={slurmSshKeyPath}
                      setSlurmSshKeyPath={setSlurmSshKeyPath}
                      slurmRestUrl={slurmRestUrl}
                      setSlurmRestUrl={setSlurmRestUrl}
                      slurmApiToken={slurmApiToken}
                      setSlurmApiToken={setSlurmApiToken}
                      providerId={providerId}
                      setSlurmApiTokenChanged={setSlurmApiTokenChanged}
                    />
                  )}

                  {type === 'skypilot' && (
                    <SkypilotProviderFields
                      skypilotServerUrl={skypilotServerUrl}
                      setSkypilotServerUrl={setSkypilotServerUrl}
                      skypilotUserId={skypilotUserId}
                      setSkypilotUserId={setSkypilotUserId}
                      skypilotUserName={skypilotUserName}
                      setSkypilotUserName={setSkypilotUserName}
                      skypilotDockerImage={skypilotDockerImage}
                      setSkypilotDockerImage={setSkypilotDockerImage}
                      skypilotDefaultRegion={skypilotDefaultRegion}
                      setSkypilotDefaultRegion={setSkypilotDefaultRegion}
                      skypilotDefaultZone={skypilotDefaultZone}
                      setSkypilotDefaultZone={setSkypilotDefaultZone}
                      skypilotUseSpot={skypilotUseSpot}
                      setSkypilotUseSpot={setSkypilotUseSpot}
                    />
                  )}

                  {type === 'dstack' && (
                    <DstackProviderFields
                      dstackServerUrl={dstackServerUrl}
                      setDstackServerUrl={setDstackServerUrl}
                      dstackApiToken={dstackApiToken}
                      setDstackApiToken={setDstackApiToken}
                      dstackProjectName={dstackProjectName}
                      setDstackProjectName={setDstackProjectName}
                      providerId={providerId}
                      setDstackApiTokenChanged={setDstackApiTokenChanged}
                    />
                  )}

                  {type === 'runpod' && (
                    <RunpodProviderFields
                      runpodApiKey={runpodApiKey}
                      setRunpodApiKey={setRunpodApiKey}
                      runpodApiBaseUrl={runpodApiBaseUrl}
                      setRunpodApiBaseUrl={setRunpodApiBaseUrl}
                      providerId={providerId}
                      setRunpodApiKeyChanged={setRunpodApiKeyChanged}
                    />
                  )}

                  {type === 'vastai' && (
                    <VastAiProviderFields
                      vastAiApiKey={vastAiApiKey}
                      setVastAiApiKey={setVastAiApiKey}
                      providerId={providerId}
                      setVastAiApiKeyChanged={setVastAiApiKeyChanged}
                    />
                  )}

                  {type === 'aws' && (
                    <AwsProviderFields
                      awsRegion={awsRegion}
                      setAwsRegion={setAwsRegion}
                      awsAccessKeyId={awsAccessKeyId}
                      setAwsAccessKeyId={setAwsAccessKeyId}
                      awsSecretAccessKey={awsSecretAccessKey}
                      setAwsSecretAccessKey={setAwsSecretAccessKey}
                      awsProfile={awsProfile}
                    />
                  )}

                  {type === 'gcp' && (
                    <GcpProviderFields
                      gcpRegion={gcpRegion}
                      setGcpRegion={setGcpRegion}
                      gcpZone={gcpZone}
                      setGcpZone={setGcpZone}
                      gcpServiceAccountJson={gcpServiceAccountJson}
                      setGcpServiceAccountJson={setGcpServiceAccountJson}
                      serviceAccountEmail={gcpServiceAccountEmail}
                    />
                  )}
                  {type === 'azure' && (
                    <AzureProviderFields
                      azureSubscriptionId={azureSubscriptionId}
                      setAzureSubscriptionId={setAzureSubscriptionId}
                      azureTenantId={azureTenantId}
                      setAzureTenantId={setAzureTenantId}
                      azureClientId={azureClientId}
                      setAzureClientId={setAzureClientId}
                      azureClientSecret={azureClientSecret}
                      setAzureClientSecret={setAzureClientSecret}
                      azureLocation={azureLocation}
                      setAzureLocation={setAzureLocation}
                      providerId={providerId}
                      setAzureClientSecretChanged={setAzureClientSecretChanged}
                    />
                  )}

                  {/* Generic JSON config for non-structured providers or advanced editing */}
                  {type !== 'slurm' &&
                    type !== 'skypilot' &&
                    type !== 'dstack' &&
                    type !== 'runpod' &&
                    type !== 'local' &&
                    type !== 'aws' &&
                    type !== 'vastai' &&
                    type !== 'gcp' &&
                    type !== 'azure' && (
                      <FormControl sx={{ mt: 1 }}>
                        <FormLabel>Configuration</FormLabel>
                        <Textarea
                          value={
                            typeof config === 'string'
                              ? config
                              : JSON.stringify(config)
                          }
                          onChange={(event) =>
                            setConfig(event.currentTarget.value)
                          }
                          placeholder="JSON sent to provider"
                          minRows={5}
                          maxRows={10}
                        />
                      </FormControl>
                    )}
                </>
              )}
            </>
          )}
        </DialogContent>
        <DialogActions>
          <Box
            sx={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'stretch',
              width: '100%',
              mt: 1,
              gap: 1,
            }}
          >
            {isSetupInProgress && setupLogTail && (
              <Box
                sx={{
                  maxHeight: 220,
                  overflow: 'auto',
                  borderRadius: 'sm',
                  border: '1px solid',
                  borderColor: 'neutral.outlinedBorder',
                  bgcolor: 'neutral.softBg',
                  p: 1,
                  fontFamily: 'monospace',
                  fontSize: '12px',
                  whiteSpace: 'pre-wrap',
                }}
              >
                {setupLogTail}
              </Box>
            )}
            <Box
              sx={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'flex-end',
                width: '100%',
                gap: 1,
              }}
            >
              {isSetupInProgress && setupStatus && (
                <Typography
                  level="body-sm"
                  sx={{ color: 'text.tertiary', mr: 1 }}
                >
                  {setupStatus}
                </Typography>
              )}
              <Button variant="outlined" onClick={onClose}>
                Cancel
              </Button>
              <Button
                onClick={saveProvider}
                loading={loading || isSetupInProgress}
                disabled={!!providerId && providerDataLoading}
              >
                {providerId ? 'Save Compute Provider' : 'Add Compute Provider'}
              </Button>
            </Box>
          </Box>
        </DialogActions>
      </ModalDialog>
    </Modal>
  );
}
