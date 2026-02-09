import React, { useState, useEffect } from 'react';
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
} from '@mui/joy';
import { useAPI, useAuth } from 'renderer/lib/authContext';
import { getPath } from 'renderer/lib/api-client/urls';

interface ProviderDetailsModalProps {
  open: boolean;
  onClose: () => void;
  teamId: string;
  providerId?: string;
}

// Default configurations for each provider type
const DEFAULT_CONFIGS = {
  skypilot: `{
  "server_url": "<Your SkyPilot server URL e.g. http://localhost:46580>",
  "default_env_vars": {
    "SKYPILOT_USER_ID": "<Your SkyPilot user ID>",
    "SKYPILOT_USER": "<Your SkyPilot user name>"
  },
  "default_entrypoint_command": ""
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
};

export default function ProviderDetailsModal({
  open,
  onClose,
  teamId,
  providerId,
}: ProviderDetailsModalProps) {
  const [name, setName] = useState('');
  const [type, setType] = useState('');
  const [config, setConfig] = useState('');
  const [loading, setLoading] = useState(false);
  
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
    }
  };

  // Helper to build SLURM config from form fields
  const buildSlurmConfig = () => {
    const configObj: any = {
      mode: slurmMode,
    };
    
    if (slurmMode === 'ssh') {
      configObj.ssh_host = slurmSshHost;
      configObj.ssh_user = slurmSshUser;
      configObj.ssh_port = parseInt(slurmSshPort) || 22;
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
    
    return configObj;
  };

  // if a providerId is passed then we are editing an existing provider
  // Otherwise we are creating a new provider
  useEffect(() => {
    if (providerId && providerData) {
      setName(providerData.name || '');
      setType(providerData.type || '');
      // Config is an object, stringify it for display in textarea
      const configObj =
        typeof providerData.config === 'string'
          ? JSON.parse(providerData.config || '{}')
          : providerData.config || {};
      
      // Parse SLURM-specific fields if this is a SLURM provider
      if (providerData.type === 'slurm') {
        parseSlurmConfig(configObj);
      }
      
      setConfig(JSON.stringify(configObj, null, 2));
    } else if (!providerId) {
      // Reset form when in "add" mode (no providerId)
      setName('');
      setType('');
      setConfig('');
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
      const defaultConfig = DEFAULT_CONFIGS[type as keyof typeof DEFAULT_CONFIGS];
      setConfig(defaultConfig);
      
      // Parse SLURM defaults
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

  // Update config JSON when SLURM form fields change
  useEffect(() => {
    if (type === 'slurm' && !providerId) {
      // Only auto-update when creating new provider, not editing
      const configObj = buildSlurmConfig();
      setConfig(JSON.stringify(configObj, null, 2));
    }
  }, [slurmMode, slurmSshHost, slurmSshUser, slurmSshPort, slurmSshKeyPath, slurmRestUrl, slurmApiToken, type, providerId]);

  async function createProvider(name: String, type: String, config: String) {
    return await fetchWithAuth(
      getPath('compute_provider', ['create'], { teamId }),
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ name, type, config }),
      },
    );
  }

  async function updateProvider(id: String, name: String, config: String) {
    return await fetchWithAuth(
      getPath('compute_provider', ['update'], { providerId: id, teamId }),
      {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ name, config }),
      },
    );
  }

  const saveProvider = async () => {
    setLoading(true);
    try {
      // For SLURM providers, build config from form fields
      let parsedConfig;
      if (type === 'slurm') {
        parsedConfig = buildSlurmConfig();
      } else {
        // The API expects an object for config, not a JSON string
        parsedConfig =
          typeof config === 'string' ? JSON.parse(config) : config;
      }

      const response = providerId
        ? await updateProvider(providerId, name, parsedConfig)
        : await createProvider(name, type, parsedConfig);

      if (response.ok) {
        setName('');
        setConfig('');
        onClose();
      } else {
        const errorData = await response.json();
        console.error('Error updating provider:', errorData);
      }
    } catch (error) {
      console.error('Error updating provider:', error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose}>
      <ModalDialog sx={{ gap: 0, width: 600, height: 500, overflow: 'auto' }}>
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
                <FormLabel>Provider Name</FormLabel>
                <Input
                  value={name}
                  onChange={(event) => setName(event.currentTarget.value)}
                  placeholder="Enter friendly name for provider"
                  fullWidth
                />
              </FormControl>
              <FormControl sx={{ mt: 1 }}>
                <FormLabel>Provider Type</FormLabel>
                <Select
                  value={type}
                  onChange={(event, value) => setType(value ?? 'skypilot')}
                  disabled={!!providerId}
                  sx={{ width: '100%' }}
                >
                  <Option value="skypilot">Skypilot</Option>
                  <Option value="slurm">SLURM</Option>
                  <Option value="runpod">Runpod (beta)</Option>
                  <Option value="local">Local (beta)</Option>
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
              
              {/* SLURM-specific form fields */}
              {type === 'slurm' && (
                <>
                  <Alert color="primary" variant="soft" sx={{ mt: 2 }}>
                    <Typography level="body-sm">
                      <strong>SLURM User ID:</strong> All jobs launched through this provider will run as the specified SLURM user. 
                      Make sure your team's SSH key (from Team Settings → SSH Key) is added to that user's authorized_keys on the SLURM login node.
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
                          onChange={(event) => setSlurmSshHost(event.currentTarget.value)}
                          placeholder="slurm-login.example.com"
                          fullWidth
                        />
                      </FormControl>
                      <FormControl sx={{ mt: 1 }}>
                        <FormLabel>SLURM User ID *</FormLabel>
                        <Input
                          value={slurmSshUser}
                          onChange={(event) => setSlurmSshUser(event.currentTarget.value)}
                          placeholder="your_slurm_username"
                          fullWidth
                        />
                        <Typography level="body-sm" sx={{ mt: 0.5, color: 'text.tertiary' }}>
                          All jobs will run as this user on SLURM
                        </Typography>
                      </FormControl>
                      <FormControl sx={{ mt: 1 }}>
                        <FormLabel>SSH Port</FormLabel>
                        <Input
                          value={slurmSshPort}
                          onChange={(event) => setSlurmSshPort(event.currentTarget.value)}
                          placeholder="22"
                          type="number"
                          fullWidth
                        />
                      </FormControl>
                      <FormControl sx={{ mt: 1 }}>
                        <FormLabel>SSH Key Path (Optional)</FormLabel>
                        <Input
                          value={slurmSshKeyPath}
                          onChange={(event) => setSlurmSshKeyPath(event.currentTarget.value)}
                          placeholder="Leave empty to use team SSH key"
                          fullWidth
                        />
                        <Typography level="body-sm" sx={{ mt: 0.5, color: 'text.tertiary' }}>
                          Path to private key on API server. If empty, will use your team's SSH key.
                        </Typography>
                      </FormControl>
                    </>
                  ) : (
                    <>
                      <FormControl sx={{ mt: 1 }}>
                        <FormLabel>REST API URL *</FormLabel>
                        <Input
                          value={slurmRestUrl}
                          onChange={(event) => setSlurmRestUrl(event.currentTarget.value)}
                          placeholder="https://slurm-api.example.com"
                          fullWidth
                        />
                      </FormControl>
                      <FormControl sx={{ mt: 1 }}>
                        <FormLabel>SLURM User ID *</FormLabel>
                        <Input
                          value={slurmSshUser}
                          onChange={(event) => setSlurmSshUser(event.currentTarget.value)}
                          placeholder="your_slurm_username"
                          fullWidth
                        />
                        <Typography level="body-sm" sx={{ mt: 0.5, color: 'text.tertiary' }}>
                          All jobs will run as this user on SLURM
                        </Typography>
                      </FormControl>
                      <FormControl sx={{ mt: 1 }}>
                        <FormLabel>API Token (Optional)</FormLabel>
                        <Input
                          value={slurmApiToken}
                          onChange={(event) => setSlurmApiToken(event.currentTarget.value)}
                          placeholder="Your SLURM REST API token"
                          type="password"
                          fullWidth
                        />
                      </FormControl>
                    </>
                  )}
                </>
              )}

              {/* Generic JSON config for non-SLURM providers or advanced editing */}
              {type !== 'slurm' && (
                <FormControl sx={{ mt: 1 }}>
                  <FormLabel>Configuration</FormLabel>
                  <Textarea
                    value={
                      typeof config === 'string' ? config : JSON.stringify(config)
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
                      typeof config === 'string' ? config : JSON.stringify(config)
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
                  <Typography level="body-sm" sx={{ mt: 0.5, color: 'text.tertiary' }}>
                    Edit JSON directly for advanced configuration. Changes will sync to form fields above.
                  </Typography>
                </FormControl>
              )}
            </>
          )}
        </DialogContent>
        <DialogActions>
          <Box sx={{ display: 'flex', justifyContent: 'flex-end', mt: 2 }}>
            <Button variant="outlined" onClick={onClose} sx={{ mr: 1 }}>
              Cancel
            </Button>
            <Button
              onClick={saveProvider}
              loading={loading}
              disabled={!!providerId && providerDataLoading}
            >
              {providerId ? 'Save Provider' : 'Add Provider'}
            </Button>
          </Box>
        </DialogActions>
      </ModalDialog>
    </Modal>
  );
}
