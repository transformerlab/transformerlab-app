import {
  Box,
  Button,
  Card,
  FormControl,
  FormLabel,
  Input,
  Stack,
  Typography,
  Alert,
  IconButton,
  Modal,
  ModalDialog,
  DialogTitle,
  DialogContent,
  DialogActions,
} from '@mui/joy';
import { useState, useEffect } from 'react';
import { useAPI, useAuth } from 'renderer/lib/authContext';
import { CopyIcon, CheckIcon } from 'lucide-react';

interface ProviderSettingsSectionProps {
  teamId: string;
}

export default function ProviderSettingsSection({
  teamId,
}: ProviderSettingsSectionProps) {
  const { fetchWithAuth } = useAuth();
  const [providers, setProviders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [publicKey, setPublicKey] = useState<string | null>(null);
  const [publicKeyLoading, setPublicKeyLoading] = useState(false);
  const [copiedKey, setCopiedKey] = useState(false);
  const [settings, setSettings] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState<Record<string, boolean>>({});

  // Load providers
  useEffect(() => {
    loadProviders();
  }, [teamId]);

  // Load public key
  useEffect(() => {
    loadPublicKey();
  }, [teamId]);

  const loadProviders = async () => {
    setLoading(true);
    try {
      const response = await fetchWithAuth('compute_provider/');
      if (response.ok) {
        const data = await response.json();
        // Filter to only SLURM providers
        const slurmProviders = data.filter((p: any) => p.type === 'slurm');
        setProviders(slurmProviders);

        // Load settings for each provider
        const settingsMap: Record<string, string> = {};
        for (const provider of slurmProviders) {
          try {
            const settingsResponse = await fetchWithAuth(
              `compute_provider/user-settings/${provider.id}`,
            );
            if (settingsResponse.ok) {
              const settingsData = await settingsResponse.json();
              settingsMap[provider.id] = settingsData.slurm_user || '';
            }
          } catch (e) {
            // Ignore errors for individual provider settings
          }
        }
        setSettings(settingsMap);
      }
    } catch (error) {
      console.error('Error loading providers:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadPublicKey = async () => {
    setPublicKeyLoading(true);
    try {
      const response = await fetchWithAuth('compute_provider/org-ssh-public-key');
      if (response.ok) {
        const data = await response.json();
        if (data.public_key) {
          setPublicKey(data.public_key);
        } else {
          console.error('No public_key in response:', data);
        }
      } else {
        const errorData = await response.json().catch(() => ({ detail: response.statusText }));
        console.error('Failed to load public key:', errorData);
      }
    } catch (error) {
      console.error('Error loading public key:', error);
    } finally {
      setPublicKeyLoading(false);
    }
  };

  const handleSaveSlurmUser = async (providerId: string, slurmUser: string) => {
    setSaving((prev) => ({ ...prev, [providerId]: true }));
    try {
      const response = await fetchWithAuth(
        `compute_provider/user-settings/${providerId}`,
        {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            slurm_user: slurmUser.trim() || null,
          }),
        },
      );

      if (response.ok) {
        setSettings((prev) => ({
          ...prev,
          [providerId]: slurmUser.trim(),
        }));
      } else {
        const errorData = await response.json();
        alert(`Failed to save: ${errorData.detail || 'Unknown error'}`);
      }
    } catch (error) {
      console.error('Error saving settings:', error);
      alert('Failed to save settings');
    } finally {
      setSaving((prev) => ({ ...prev, [providerId]: false }));
    }
  };

  const handleCopyPublicKey = () => {
    if (publicKey) {
      navigator.clipboard.writeText(publicKey);
      setCopiedKey(true);
      setTimeout(() => setCopiedKey(false), 2000);
    }
  };

  if (loading) {
    return (
      <Box mt={4}>
        <Typography level="title-lg">Provider Settings</Typography>
        <Typography level="body-sm" color="neutral" mt={1}>
          Loading...
        </Typography>
      </Box>
    );
  }

  if (providers.length === 0) {
    return (
      <Box mt={4}>
        <Typography level="title-lg">Provider Settings</Typography>
        <Typography level="body-sm" color="neutral" mt={1}>
          No SLURM providers configured for this team. Ask your team owner to add
          a SLURM provider in Team Settings.
        </Typography>
      </Box>
    );
  }

  return (
    <Box mt={4}>
      <Typography level="title-lg" mb={2}>
        Provider Settings
      </Typography>
      <Typography level="body-sm" color="neutral" mb={3}>
        Configure your personal settings for each SLURM provider. Your SLURM
        username will be used for all jobs you launch through that provider.
      </Typography>

      {/* SSH Public Key Section */}
      <Card variant="outlined" sx={{ p: 2, mb: 3 }}>
        <Stack spacing={2}>
          <Typography level="title-sm">Organization SSH Public Key</Typography>
          <Typography level="body-sm" color="neutral">
            Copy this public key and add it to{' '}
            <code>~/.ssh/authorized_keys</code> on your SLURM login node for
            the user account you specify below. This allows the API server to
            SSH into your SLURM account to launch jobs.
          </Typography>
          {publicKeyLoading ? (
            <Typography level="body-sm" color="neutral">
              Loading public key...
            </Typography>
          ) : publicKey ? (
            <Box>
              <Input
                value={publicKey}
                readOnly
                sx={{
                  fontFamily: 'monospace',
                  fontSize: 'sm',
                  '& input': {
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                  },
                }}
                endDecorator={
                  <IconButton
                    onClick={handleCopyPublicKey}
                    variant="plain"
                    color={copiedKey ? 'success' : 'neutral'}
                  >
                    {copiedKey ? (
                      <CheckIcon size={16} />
                    ) : (
                      <CopyIcon size={16} />
                    )}
                  </IconButton>
                }
              />
              {copiedKey && (
                <Typography level="body-xs" color="success" mt={0.5}>
                  Copied to clipboard!
                </Typography>
              )}
            </Box>
          ) : (
            <Alert color="warning" variant="soft">
              <Typography level="body-sm">
                No SSH key found. Ask your team owner to create one in Team
                Settings → SSH Key.
              </Typography>
            </Alert>
          )}
        </Stack>
      </Card>

      {/* Provider Settings */}
      <Stack spacing={2}>
        {providers.map((provider) => (
          <Card key={provider.id} variant="outlined" sx={{ p: 2 }}>
            <Stack spacing={2}>
              <Typography level="title-sm">{provider.name}</Typography>
              <FormControl>
                <FormLabel>Your SLURM User ID</FormLabel>
                <Input
                  placeholder="e.g., your_username"
                  value={settings[provider.id] || ''}
                  onChange={(e) => {
                    setSettings((prev) => ({
                      ...prev,
                      [provider.id]: e.target.value,
                    }));
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !saving[provider.id]) {
                      handleSaveSlurmUser(
                        provider.id,
                        settings[provider.id] || '',
                      );
                    }
                  }}
                  endDecorator={
                    <Button
                      size="sm"
                      onClick={() =>
                        handleSaveSlurmUser(
                          provider.id,
                          settings[provider.id] || '',
                        )
                      }
                      loading={saving[provider.id]}
                      disabled={saving[provider.id]}
                    >
                      Save
                    </Button>
                  }
                />
                <Typography level="body-xs" color="neutral" mt={0.5}>
                  All jobs you launch through this provider will run as this
                  user on SLURM. Make sure the SSH public key above is added to
                  this user's <code>~/.ssh/authorized_keys</code> on the SLURM
                  login node.
                </Typography>
              </FormControl>
            </Stack>
          </Card>
        ))}
      </Stack>
    </Box>
  );
}
