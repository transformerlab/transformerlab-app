/* eslint-disable react/prop-types */
/* eslint-disable react/require-default-props */
import React, { useCallback, useEffect, useState } from 'react';
import {
  Box,
  Button,
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
  Textarea,
  Alert,
  Chip,
} from '@mui/joy';
import { useAPI, useAuth } from 'renderer/lib/authContext';
import { getPath } from 'renderer/lib/api-client/urls';
import { Endpoints } from 'renderer/lib/api-client/endpoints';
import { useNotification } from 'renderer/components/Shared/NotificationSystem';

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
  "api_key": "<Your Runpod API key>",
  "api_base_url": "https://rest.runpod.io/v1"
}`,
  local: `{}`,
} as const;

const DEFAULT_SUPPORTED_ACCELERATORS: Record<string, string[]> = {
  skypilot: ['NVIDIA'],
  slurm: ['NVIDIA'],
  runpod: ['NVIDIA'],
  local: ['AppleSilicon', 'cpu'],
};

export default function ProviderDetailsModal({
  open,
  onClose,
  teamId,
  providerId,
  hasLocalProvider = false,
}: ProviderDetailsModalProps) {
  const [name, setName] = useState('');
  const [type, setType] = useState('');
  const [config, setConfig] = useState('');
  const [loading, setLoading] = useState(false);
  const [isSetupInProgress, setIsSetupInProgress] = useState(false);
  const [setupStatus, setSetupStatus] = useState<string | null>(null);
  const { addNotification } = useNotification();
  const [supportedAccelerators, setSupportedAccelerators] = useState<string[]>(
    [],
  );
  const [preTaskHook, setPreTaskHook] = useState<string>('');
  const [postTaskHook, setPostTaskHook] = useState<string>('');

  // SLURM-specific form fields
  const [slurmMode, setSlurmMode] = useState<'ssh' | 'rest'>('ssh');
  const [slurmSshHost, setSlurmSshHost] = useState('');
  const [slurmSshUser, setSlurmSshUser] = useState('');
  const [slurmSshPort, setSlurmSshPort] = useState('22');
  const [slurmSshKeyPath, setSlurmSshKeyPath] = useState('');
  const [slurmRestUrl, setSlurmRestUrl] = useState('');
  const [slurmApiToken, setSlurmApiToken] = useState('');

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

  // Helper to parse config and extract SLURM fields
  const parseSlurmConfig = (configObj: any) => {
    if (configObj && typeof configObj === 'object') {
      setSlurmMode(configObj.mode === 'rest' ? 'rest' : 'ssh');
      setSlurmSshHost(configObj.ssh_host || '');
      setSlurmSshUser(configObj.ssh_user || '');
      setSlurmSshPort(String(configObj.ssh_port || 22));
      setSlurmSshKeyPath(configObj.ssh_key_path || '');
      setSlurmRestUrl(configObj.rest_url || '');
      setSlurmApiToken(configObj.api_token || '');
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
      if (slurmApiToken) {
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
    supportedAccelerators,
  ]);

  // if a providerId is passed then we are editing an existing provider
  // Otherwise we are creating a new provider
  useEffect(() => {
    if (providerId && providerData) {
      setName(providerData.name || '');
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
      } else {
        setPreTaskHook('');
        setPostTaskHook('');
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
      setConfig(JSON.stringify(rawConfigObj, null, 2));
    } else if (!providerId) {
      // Reset form when in "add" mode (no providerId)
      setName('');
      setType('');
      setConfig('');
      setSupportedAccelerators([]);
      setPreTaskHook('');
      setPostTaskHook('');
      setSlurmMode('ssh');
      setSlurmSshHost('');
      setSlurmSshUser('');
      setSlurmSshPort('22');
      setSlurmSshKeyPath('');
      setSlurmRestUrl('');
      setSlurmApiToken('');
    }
  }, [providerId, providerData]);

  // Reset form when modal closes
  useEffect(() => {
    if (!open) {
      setName('');
      setType('');
      setConfig('');
      setSupportedAccelerators([]);
      setPreTaskHook('');
      setPostTaskHook('');
      setSlurmMode('ssh');
      setSlurmSshHost('');
      setSlurmSshUser('');
      setSlurmSshPort('22');
      setSlurmSshKeyPath('');
      setSlurmRestUrl('');
      setSlurmApiToken('');
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
        setSupportedAccelerators(DEFAULT_SUPPORTED_ACCELERATORS['local'] || []);

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
    }
  }, [type, providerId]);

  // Update config JSON when form fields change
  useEffect(() => {
    if (!providerId) {
      // Only auto-update when creating new provider, not editing
      if (type === 'slurm') {
        const configObj = buildSlurmConfig();
        setConfig(JSON.stringify(configObj, null, 2));
      }
    }
  }, [buildSlurmConfig, type, providerId]);

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
    poll();
  };

  function createProvider(
    providerName: string,
    providerType: string,
    providerConfig: any,
  ) {
    return fetchWithAuth(getPath('compute_provider', ['create'], { teamId }), {
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

  const saveProvider = async () => {
    setLoading(true);
    try {
      // For SLURM providers, build config from form fields
      let parsedConfig: any;
      if (type === 'slurm') {
        parsedConfig = buildSlurmConfig();
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
      if (Object.keys(parsedConfig.extra_config).length === 0) {
        delete parsedConfig.extra_config;
      }

      const response = providerId
        ? await updateProvider(providerId, name, parsedConfig)
        : await createProvider(name, type, parsedConfig);

      if (response.ok) {
        // For newly created LOCAL providers, keep the modal open and show setup progress.
        if (!providerId && type === 'local') {
          const data = await response.json().catch(() => ({}));
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
        const errorData = await response.json();
        // eslint-disable-next-line no-console
        console.error('Error updating provider:', errorData);
      }
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('Error updating provider:', error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose}>
      <ModalDialog sx={{ gap: 0, width: 600, height: 700, overflow: 'auto' }}>
        <DialogTitle>
          {providerId ? 'Edit Compute Provider' : 'Add Compute Provider'}
        </DialogTitle>
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
              <FormControl sx={{ mt: 2 }}>
                <FormLabel>Compute Provider Name</FormLabel>
                <Input
                  value={name}
                  onChange={(event) => setName(event.currentTarget.value)}
                  placeholder="Enter friendly name for compute provider"
                  fullWidth
                />
              </FormControl>
              <FormControl sx={{ mt: 1 }}>
                <FormLabel>Compute Provider Type</FormLabel>
                <Select
                  value={type}
                  onChange={(event, value) => setType(value ?? 'skypilot')}
                  disabled={!!providerId}
                  sx={{ width: '100%' }}
                >
                  <Option value="skypilot">Skypilot</Option>
                  <Option value="slurm">SLURM</Option>
                  <Option value="runpod">Runpod</Option>
                  {!hasLocalProvider && !providerId && (
                    <Option value="local">Local (beta)</Option>
                  )}
                </Select>
                {providerId && (
                  <Typography
                    level="body-sm"
                    sx={{ mt: 0.5, color: 'text.tertiary' }}
                  >
                    Provider type cannot be changed after creation
                  </Typography>
                )}
              </FormControl>

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

              {/* SLURM-specific form fields */}
              {type === 'slurm' && (
                <>
                  <Alert color="primary" variant="soft" sx={{ mt: 2 }}>
                    <Typography level="body-sm">
                      <strong>SLURM User ID:</strong> All jobs launched through
                      this provider will run as the specified SLURM user. Make
                      sure your team&apos;s SSH key (from Team Settings → SSH
                      Key) is added to that user&apos;s authorized_keys on the
                      SLURM login node.
                    </Typography>
                  </Alert>

                  <FormControl sx={{ mt: 2 }}>
                    <FormLabel>Connection Mode</FormLabel>
                    <Select
                      value={slurmMode}
                      onChange={(event, value) => setSlurmMode(value ?? 'ssh')}
                      sx={{ width: '100%' }}
                    >
                      <Option value="ssh">SSH</Option>
                      <Option value="rest">REST API</Option>
                    </Select>
                  </FormControl>

                  {slurmMode === 'ssh' ? (
                    <>
                      <FormControl sx={{ mt: 1 }}>
                        <FormLabel>SSH Host *</FormLabel>
                        <Input
                          value={slurmSshHost}
                          onChange={(event) =>
                            setSlurmSshHost(event.currentTarget.value)
                          }
                          placeholder="slurm-login.example.com"
                          fullWidth
                        />
                      </FormControl>
                      <FormControl sx={{ mt: 1 }}>
                        <FormLabel>SLURM User ID *</FormLabel>
                        <Input
                          value={slurmSshUser}
                          onChange={(event) =>
                            setSlurmSshUser(event.currentTarget.value)
                          }
                          placeholder="your_slurm_username"
                          fullWidth
                        />
                        <Typography
                          level="body-sm"
                          sx={{ mt: 0.5, color: 'text.tertiary' }}
                        >
                          All jobs will run as this user on SLURM
                        </Typography>
                      </FormControl>
                      <FormControl sx={{ mt: 1 }}>
                        <FormLabel>SSH Port</FormLabel>
                        <Input
                          value={slurmSshPort}
                          onChange={(event) =>
                            setSlurmSshPort(event.currentTarget.value)
                          }
                          placeholder="22"
                          type="number"
                          fullWidth
                        />
                      </FormControl>
                      <FormControl sx={{ mt: 1 }}>
                        <FormLabel>SSH Key Path (Optional)</FormLabel>
                        <Input
                          value={slurmSshKeyPath}
                          onChange={(event) =>
                            setSlurmSshKeyPath(event.currentTarget.value)
                          }
                          placeholder="Leave empty to use team SSH key"
                          fullWidth
                        />
                        <Typography
                          level="body-sm"
                          sx={{ mt: 0.5, color: 'text.tertiary' }}
                        >
                          Path to private key on API server. If empty, will use
                          your team&apos;s SSH key.
                        </Typography>
                      </FormControl>
                    </>
                  ) : (
                    <>
                      <FormControl sx={{ mt: 1 }}>
                        <FormLabel>REST API URL *</FormLabel>
                        <Input
                          value={slurmRestUrl}
                          onChange={(event) =>
                            setSlurmRestUrl(event.currentTarget.value)
                          }
                          placeholder="https://slurm-api.example.com"
                          fullWidth
                        />
                      </FormControl>
                      <FormControl sx={{ mt: 1 }}>
                        <FormLabel>SLURM User ID *</FormLabel>
                        <Input
                          value={slurmSshUser}
                          onChange={(event) =>
                            setSlurmSshUser(event.currentTarget.value)
                          }
                          placeholder="your_slurm_username"
                          fullWidth
                        />
                        <Typography
                          level="body-sm"
                          sx={{ mt: 0.5, color: 'text.tertiary' }}
                        >
                          All jobs will run as this user on SLURM
                        </Typography>
                      </FormControl>
                      <FormControl sx={{ mt: 1 }}>
                        <FormLabel>API Token (Optional)</FormLabel>
                        <Input
                          value={slurmApiToken}
                          onChange={(event) =>
                            setSlurmApiToken(event.currentTarget.value)
                          }
                          placeholder="Your SLURM REST API token"
                          type="password"
                          fullWidth
                        />
                      </FormControl>
                    </>
                  )}
                </>
              )}

              <FormControl sx={{ mt: 2 }}>
                <FormLabel>Harness hooks (bash)</FormLabel>
                <Typography
                  level="body-sm"
                  sx={{ color: 'text.tertiary', mb: 1 }}
                >
                  These are concatenated around the task command as: pre ; task
                  ; post
                </Typography>
                <FormLabel sx={{ mt: 1 }}>Pre hook (optional)</FormLabel>
                <Textarea
                  value={preTaskHook}
                  onChange={(event) =>
                    setPreTaskHook(event.currentTarget.value)
                  }
                  placeholder="Commands to run before the run script in every task"
                  minRows={2}
                  maxRows={6}
                />
                <FormLabel sx={{ mt: 1 }}>Post hook (optional)</FormLabel>
                <Textarea
                  value={postTaskHook}
                  onChange={(event) =>
                    setPostTaskHook(event.currentTarget.value)
                  }
                  placeholder="Commands to run after the run script in every task"
                  minRows={2}
                  maxRows={6}
                />
              </FormControl>

              {/* Generic JSON config for non-SLURM providers or advanced editing */}
              {type !== 'slurm' && type !== 'local' && (
                <FormControl sx={{ mt: 1 }}>
                  <FormLabel>Configuration</FormLabel>
                  <Textarea
                    value={
                      typeof config === 'string'
                        ? config
                        : JSON.stringify(config)
                    }
                    onChange={(event) => setConfig(event.currentTarget.value)}
                    placeholder="JSON sent to provider"
                    minRows={5}
                    maxRows={10}
                  />
                </FormControl>
              )}

              {/* Show JSON for SLURM providers in edit mode for advanced users */}
              {type === 'slurm' && providerId && (
                <FormControl sx={{ mt: 1 }}>
                  <FormLabel>Advanced: Raw Configuration (JSON)</FormLabel>
                  <Textarea
                    value={
                      typeof config === 'string'
                        ? config
                        : JSON.stringify(config)
                    }
                    onChange={(event) => {
                      setConfig(event.currentTarget.value);
                      // Try to parse and update form fields
                      try {
                        const configObj = JSON.parse(event.currentTarget.value);
                        parseSlurmConfig(configObj);
                      } catch (e) {
                        // Ignore parse errors
                      }
                    }}
                    placeholder="JSON sent to provider"
                    minRows={3}
                    maxRows={5}
                  />
                  <Typography
                    level="body-sm"
                    sx={{ mt: 0.5, color: 'text.tertiary' }}
                  >
                    Edit JSON directly for advanced configuration. Changes will
                    sync to form fields above.
                  </Typography>
                </FormControl>
              )}
            </>
          )}
        </DialogContent>
        <DialogActions>
          <Box
            sx={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'flex-end',
              width: '100%',
              mt: 1,
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
        </DialogActions>
      </ModalDialog>
    </Modal>
  );
}
