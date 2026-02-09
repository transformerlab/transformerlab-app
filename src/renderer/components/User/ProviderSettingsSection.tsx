import {
  Box,
  Button,
  Card,
  FormControl,
  FormLabel,
  Input,
  Modal,
  ModalDialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Stack,
  Typography,
  Textarea,
  Alert,
  Chip,
} from '@mui/joy';
import { useState, useEffect } from 'react';
import { useAPI, useAuth } from 'renderer/lib/authContext';
import { TrashIcon, KeyIcon } from 'lucide-react';
import { getAPIFullPath } from 'renderer/lib/api-client/urls';

export default function ProviderSettingsSection() {
  const authContext = useAuth();
  const { fetchWithAuth } = useAuth();
  const { data: providers } = useAPI('compute_provider', ['list'], {});

  const [userSettings, setUserSettings] = useState<
    Record<string, { slurm_user: string | null; has_ssh_key: boolean }>
  >({});
  const [loadingSettings, setLoadingSettings] = useState<
    Record<string, boolean>
  >({});
  const [savingSettings, setSavingSettings] = useState<Record<string, boolean>>(
    {},
  );
  const [sshKeyModalOpen, setSshKeyModalOpen] = useState<
    Record<string, boolean>
  >({});
  const [sshKeyContent, setSshKeyContent] = useState<Record<string, string>>(
    {},
  );
  const [uploadingKey, setUploadingKey] = useState<Record<string, boolean>>({});
  const [deletingKey, setDeletingKey] = useState<Record<string, boolean>>({});

  const slurmProviders = (Array.isArray(providers) ? providers : []).filter(
    (p: { type: string }) => p.type === 'slurm',
  );

  useEffect(() => {
    if (!authContext.team?.id || slurmProviders.length === 0) return;

    const loadSettings = async () => {
      for (const provider of slurmProviders) {
        if (loadingSettings[provider.id]) continue;
        setLoadingSettings((prev) => ({ ...prev, [provider.id]: true }));
        try {
          const response = await fetchWithAuth(
            getAPIFullPath('compute_provider', ['user-settings'], {
              providerId: provider.id,
            }) || '',
          );
          if (response.ok) {
            const data = await response.json();
            setUserSettings((prev) => ({
              ...prev,
              [provider.id]: {
                slurm_user: data.slurm_user || null,
                has_ssh_key: data.has_ssh_key || false,
              },
            }));
          }
        } catch (error) {
          console.error(
            `Error loading settings for provider ${provider.id}:`,
            error,
          );
        } finally {
          setLoadingSettings((prev) => ({ ...prev, [provider.id]: false }));
        }
      }
    };

    loadSettings();
  }, [authContext.team?.id, providers, fetchWithAuth]);

  const handleSaveSlurmUser = async (providerId: string) => {
    setSavingSettings((prev) => ({ ...prev, [providerId]: true }));
    try {
      const currentSettings = userSettings[providerId] || { slurm_user: null };
      const response = await fetchWithAuth(
        getAPIFullPath('compute_provider', ['user-settings-update'], {
          providerId,
        }) || '',
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            slurm_user: currentSettings.slurm_user || null,
          }),
        },
      );
      if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        alert(
          `Failed to save SLURM user: ${error.detail || response.statusText}`,
        );
        return;
      }
      const data = await response.json();
      setUserSettings((prev) => ({
        ...prev,
        [providerId]: {
          slurm_user: data.slurm_user || null,
          has_ssh_key:
            data.has_ssh_key ?? prev[providerId]?.has_ssh_key ?? false,
        },
      }));
    } catch (error) {
      console.error('Error saving SLURM user:', error);
      alert('Failed to save SLURM user');
    } finally {
      setSavingSettings((prev) => ({ ...prev, [providerId]: false }));
    }
  };

  const handleUploadSshKey = async (providerId: string) => {
    const keyContent = sshKeyContent[providerId]?.trim();
    if (!keyContent) {
      alert('Please paste your private key');
      return;
    }
    setUploadingKey((prev) => ({ ...prev, [providerId]: true }));
    try {
      const response = await fetchWithAuth(
        getAPIFullPath('compute_provider', ['user-settings-ssh-key'], {
          providerId,
        }) || '',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ private_key: keyContent }),
        },
      );
      if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        alert(
          `Failed to upload SSH key: ${error.detail || response.statusText}`,
        );
        return;
      }
      const settingsResponse = await fetchWithAuth(
        getAPIFullPath('compute_provider', ['user-settings'], { providerId }) ||
          '',
      );
      if (settingsResponse.ok) {
        const data = await settingsResponse.json();
        setUserSettings((prev) => ({
          ...prev,
          [providerId]: {
            slurm_user: data.slurm_user ?? prev[providerId]?.slurm_user ?? null,
            has_ssh_key: data.has_ssh_key || false,
          },
        }));
      }
      setSshKeyModalOpen((prev) => ({ ...prev, [providerId]: false }));
      setSshKeyContent((prev) => ({ ...prev, [providerId]: '' }));
    } catch (error) {
      console.error('Error uploading SSH key:', error);
      alert('Failed to upload SSH key');
    } finally {
      setUploadingKey((prev) => ({ ...prev, [providerId]: false }));
    }
  };

  const handleDeleteSshKey = async (providerId: string) => {
    if (
      !confirm(
        'Are you sure you want to delete your SSH key? You will need to upload it again to use this provider.',
      )
    ) {
      return;
    }
    setDeletingKey((prev) => ({ ...prev, [providerId]: true }));
    try {
      const response = await fetchWithAuth(
        getAPIFullPath('compute_provider', ['user-settings-ssh-key-delete'], {
          providerId,
        }) || '',
        { method: 'DELETE' },
      );
      if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        alert(
          `Failed to delete SSH key: ${error.detail || response.statusText}`,
        );
        return;
      }
      const settingsResponse = await fetchWithAuth(
        getAPIFullPath('compute_provider', ['user-settings'], { providerId }) ||
          '',
      );
      if (settingsResponse.ok) {
        const data = await settingsResponse.json();
        setUserSettings((prev) => ({
          ...prev,
          [providerId]: {
            slurm_user: data.slurm_user ?? prev[providerId]?.slurm_user ?? null,
            has_ssh_key: data.has_ssh_key || false,
          },
        }));
      }
    } catch (error) {
      console.error('Error deleting SSH key:', error);
      alert('Failed to delete SSH key');
    } finally {
      setDeletingKey((prev) => ({ ...prev, [providerId]: false }));
    }
  };

  if (!authContext.team?.id) return null;

  if (slurmProviders.length === 0) {
    return (
      <Box mt={4}>
        <Typography level="title-lg">Provider Settings</Typography>
        <Typography level="body-md" color="neutral" mt={1}>
          No SLURM providers configured for your team.
        </Typography>
      </Box>
    );
  }

  return (
    <Box mt={4}>
      <Typography level="title-lg" mb={2}>
        Provider Settings
      </Typography>
      <Typography level="body-sm" color="neutral" mb={2}>
        Configure your personal settings for SLURM providers. These settings are
        specific to your account.
      </Typography>

      <Stack gap={2}>
        {slurmProviders.map((provider: { id: string; name: string }) => {
          const settings = userSettings[provider.id] || {
            slurm_user: null,
            has_ssh_key: false,
          };
          const isLoading = loadingSettings[provider.id] || false;
          const isSaving = savingSettings[provider.id] || false;

          return (
            <Card key={provider.id} variant="outlined" sx={{ p: 2 }}>
              <Stack gap={2}>
                <Box>
                  <Typography level="title-md">{provider.name}</Typography>
                  <Typography level="body-xs" color="neutral">
                    {provider.id}
                  </Typography>
                </Box>

                <FormControl>
                  <FormLabel>SLURM Username</FormLabel>
                  <Input
                    placeholder="e.g., your_username"
                    value={settings.slurm_user || ''}
                    onChange={(e) => {
                      setUserSettings((prev) => ({
                        ...prev,
                        [provider.id]: {
                          ...(prev[provider.id] || {
                            slurm_user: null,
                            has_ssh_key: false,
                          }),
                          slurm_user: e.target.value || null,
                        },
                      }));
                    }}
                    disabled={isLoading || isSaving}
                    endDecorator={
                      <Button
                        size="sm"
                        onClick={() => handleSaveSlurmUser(provider.id)}
                        loading={isSaving}
                        disabled={isLoading || isSaving}
                      >
                        Save
                      </Button>
                    }
                  />
                  <Typography level="body-xs" color="neutral" mt={0.5}>
                    Your SLURM username on this cluster. This will be used when
                    launching jobs.
                  </Typography>
                </FormControl>

                <Box>
                  <Stack
                    direction="row"
                    justifyContent="space-between"
                    alignItems="center"
                    mb={1}
                  >
                    <FormLabel>SSH Private Key</FormLabel>
                    <Stack direction="row" spacing={1}>
                      {settings.has_ssh_key && (
                        <Chip size="sm" color="success" variant="soft">
                          Key uploaded
                        </Chip>
                      )}
                      {settings.has_ssh_key && (
                        <Button
                          size="sm"
                          variant="outlined"
                          color="danger"
                          onClick={() => handleDeleteSshKey(provider.id)}
                          loading={deletingKey[provider.id]}
                          disabled={deletingKey[provider.id]}
                        >
                          <TrashIcon size={16} style={{ marginRight: 4 }} />
                          Delete Key
                        </Button>
                      )}
                      <Button
                        size="sm"
                        variant="outlined"
                        onClick={() =>
                          setSshKeyModalOpen((prev) => ({
                            ...prev,
                            [provider.id]: true,
                          }))
                        }
                      >
                        <KeyIcon size={16} style={{ marginRight: 4 }} />
                        {settings.has_ssh_key ? 'Update Key' : 'Upload Key'}
                      </Button>
                    </Stack>
                  </Stack>
                  <Alert color="neutral" sx={{ mt: 1 }}>
                    <Typography level="body-sm">
                      <strong>Instructions:</strong>
                      <br />
                      1. Generate an SSH key pair on your machine if needed:{' '}
                      <code style={{ fontSize: '0.85em' }}>
                        ssh-keygen -t rsa -b 4096 -C
                        &quot;your_email@example.com&quot;
                      </code>
                      <br />
                      2. Add your <strong>public key</strong> (
                      <code>~/.ssh/id_rsa.pub</code>) to{' '}
                      <code>~/.ssh/authorized_keys</code> on your SLURM login
                      node for the user account above.
                      <br />
                      3. Paste your <strong>private key</strong> (
                      <code>~/.ssh/id_rsa</code>) in the upload dialog.
                      TransformerLab will use it to connect to your SLURM
                      account.
                    </Typography>
                  </Alert>
                </Box>

                <Modal
                  open={!!sshKeyModalOpen[provider.id]}
                  onClose={() => {
                    setSshKeyModalOpen((prev) => ({
                      ...prev,
                      [provider.id]: false,
                    }));
                    setSshKeyContent((prev) => ({
                      ...prev,
                      [provider.id]: '',
                    }));
                  }}
                >
                  <ModalDialog sx={{ maxWidth: 600 }}>
                    <DialogTitle>Upload SSH Private Key</DialogTitle>
                    <DialogContent>
                      <Alert color="warning" sx={{ mb: 2 }}>
                        <Typography level="body-sm">
                          <strong>Security:</strong> Your private key is stored
                          on the server. Ensure you trust the server
                          administrators.
                        </Typography>
                      </Alert>
                      <FormControl>
                        <FormLabel>
                          Private Key (PEM or OpenSSH format)
                        </FormLabel>
                        <Textarea
                          placeholder="-----BEGIN RSA PRIVATE KEY-----&#10;...&#10;-----END RSA PRIVATE KEY-----"
                          value={sshKeyContent[provider.id] || ''}
                          onChange={(e) =>
                            setSshKeyContent((prev) => ({
                              ...prev,
                              [provider.id]: e.target.value,
                            }))
                          }
                          minRows={8}
                          sx={{ fontFamily: 'monospace', fontSize: 'sm' }}
                        />
                        <Typography level="body-xs" color="neutral" mt={0.5}>
                          Paste your private key content here. It should start
                          with <code>-----BEGIN</code>.
                        </Typography>
                      </FormControl>
                    </DialogContent>
                    <DialogActions>
                      <Button
                        onClick={() => {
                          setSshKeyModalOpen((prev) => ({
                            ...prev,
                            [provider.id]: false,
                          }));
                          setSshKeyContent((prev) => ({
                            ...prev,
                            [provider.id]: '',
                          }));
                        }}
                        variant="plain"
                        disabled={!!uploadingKey[provider.id]}
                      >
                        Cancel
                      </Button>
                      <Button
                        onClick={() => handleUploadSshKey(provider.id)}
                        variant="solid"
                        loading={!!uploadingKey[provider.id]}
                        disabled={!!uploadingKey[provider.id]}
                      >
                        Upload
                      </Button>
                    </DialogActions>
                  </ModalDialog>
                </Modal>
              </Stack>
            </Card>
          );
        })}
      </Stack>
    </Box>
  );
}
