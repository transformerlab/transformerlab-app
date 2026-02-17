import {
  Box,
  Button,
  Typography,
  Input,
  Stack,
  CircularProgress,
  Alert,
  FormControl,
  FormLabel,
  Card,
  IconButton,
  Table,
  Modal,
  ModalDialog,
  ModalClose,
  DialogTitle,
  DialogContent,
  DialogActions,
} from '@mui/joy';
import {
  KeyIcon,
  PlusIcon,
  Trash2Icon,
  EyeIcon,
  EditIcon,
  CopyIcon,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { useAuth } from 'renderer/lib/authContext';
import { API_URL } from 'renderer/lib/api-client/urls';
import SpecialSecretsSection from '../Team/SpecialSecretsSection';

interface SecretEntry {
  key: string;
  value: string;
  isNew?: boolean;
  isEditing?: boolean;
  isViewing?: boolean;
}

export default function UserSecretsSection() {
  const { fetchWithAuth } = useAuth();
  const [secrets, setSecrets] = useState<SecretEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [viewSecretModal, setViewSecretModal] = useState<{
    open: boolean;
    secretKey: string;
    secretValue: string;
  }>({ open: false, secretKey: '', secretValue: '' });

  useEffect(() => {
    const fetchSecrets = async () => {
      try {
        setLoading(true);
        setError(null);
        const res = await fetchWithAuth(`${API_URL()}users/me/secrets`);

        if (res.ok) {
          const data = await res.json();
          // Convert secret keys to entries (values are masked)
          const secretEntries: SecretEntry[] = (data.secret_keys || []).map(
            (key: string) => ({
              key,
              value: '', // Values are masked, so we don't show them
            }),
          );
          setSecrets(secretEntries);
        } else {
          const errorData = await res.json();
          setError(errorData.detail || 'Failed to load user secrets');
        }
      } catch (err: any) {
        console.error('Error fetching secrets:', err);
        setError('Failed to load user secrets');
      } finally {
        setLoading(false);
      }
    };

    fetchSecrets();
  }, [fetchWithAuth]);

  const handleAddSecret = () => {
    setSecrets([...secrets, { key: '', value: '', isNew: true }]);
  };

  const handleRemoveSecret = (index: number) => {
    setSecrets(secrets.filter((_, i) => i !== index));
  };

  const handleUpdateSecret = (
    index: number,
    field: 'key' | 'value',
    newValue: string,
  ) => {
    const updated = [...secrets];
    updated[index] = { ...updated[index], [field]: newValue };
    setSecrets(updated);
  };

  const handleViewSecret = async (secretKey: string) => {
    // Fetch from API (users can always view their own secrets)
    try {
      const res = await fetchWithAuth(
        `${API_URL()}users/me/secrets?include_values=true`,
      );
      if (res.ok) {
        const data = await res.json();
        const actualValue = data.secrets?.[secretKey];
        if (actualValue && actualValue !== '***') {
          setViewSecretModal({
            open: true,
            secretKey,
            secretValue: actualValue,
          });
        } else {
          alert('Unable to retrieve secret value.');
          setViewSecretModal({ open: false, secretKey: '', secretValue: '' });
        }
      } else {
        alert('Failed to retrieve secret value from server.');
        setViewSecretModal({ open: false, secretKey: '', secretValue: '' });
      }
    } catch (err) {
      console.error('Error fetching secret:', err);
      alert('Failed to retrieve secret value.');
      setViewSecretModal({ open: false, secretKey: '', secretValue: '' });
    }
  };

  const handleEditSecret = (index: number) => {
    const updated = [...secrets];
    updated[index] = { ...updated[index], isEditing: true };
    setSecrets(updated);
  };

  const handleCancelEdit = (index: number) => {
    const updated = [...secrets];
    updated[index] = { ...updated[index], isEditing: false, value: '' };
    setSecrets(updated);
  };

  const handleSaveSecret = async (index: number) => {
    const secret = secrets[index];

    // Validate key
    if (!secret.key.trim()) {
      setError('Secret key is required');
      return;
    }

    // Validate key format (must be valid env var name)
    const keyPattern = /^[A-Za-z_][A-Za-z0-9_]*$/;
    if (!keyPattern.test(secret.key)) {
      setError(
        'Secret keys must start with a letter or underscore and contain only letters, numbers, and underscores',
      );
      return;
    }

    // Validate value
    if (!secret.value.trim()) {
      setError('Secret value is required');
      return;
    }

    // Check for duplicate keys (excluding current secret)
    const keys = secrets.map((s, i) => (i !== index ? s.key : ''));
    if (keys.includes(secret.key)) {
      setError('Duplicate secret keys are not allowed');
      return;
    }

    setSaving(true);
    setError(null);

    try {
      // Fetch current secrets from API to merge with the one we're saving
      let currentSecrets: Record<string, string> = {};
      try {
        const getRes = await fetchWithAuth(
          `${API_URL()}users/me/secrets?include_values=true`,
        );
        if (getRes.ok) {
          const getData = await getRes.json();
          currentSecrets = getData.secrets || {};
        }
      } catch (err) {
        // If we can't fetch, start with empty object
        console.warn('Could not fetch current secrets:', err);
      }

      // Merge current secrets with the one being saved
      const secretsObj: Record<string, string> = {
        ...currentSecrets,
        [secret.key]: secret.value,
      };

      // Also include any other secrets that are being edited/added
      secrets.forEach((s, i) => {
        if (i !== index && s.key.trim() && s.value.trim()) {
          secretsObj[s.key] = s.value;
        }
      });

      const res = await fetchWithAuth(`${API_URL()}users/me/secrets`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ secrets: secretsObj }),
      });

      if (res.ok) {
        const data = await res.json();

        // Refresh the secrets list from API to get all current secrets
        const getRes = await fetchWithAuth(`${API_URL()}users/me/secrets`);
        if (getRes.ok) {
          const getData = await getRes.json();
          const updatedSecrets: SecretEntry[] = (getData.secret_keys || []).map(
            (key: string) => ({
              key,
              value: '', // Don't show values after saving
              isEditing: false,
              isNew: false,
            }),
          );
          setSecrets(updatedSecrets);
        } else {
          // Fallback: just update the current secret
          const updated = [...secrets];
          updated[index] = {
            key: secret.key,
            value: '', // Clear value after saving
            isEditing: false,
            isNew: false,
          };
          setSecrets(updated);
        }
        setError(null);
      } else {
        const errorData = await res.json();
        setError(errorData.detail || 'Failed to save secret');
      }
    } catch (err: any) {
      console.error('Error saving secret:', err);
      setError('Failed to save secret');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <Box sx={{ mt: 4 }}>
        <Typography level="title-lg" mb={1} startDecorator={<KeyIcon />}>
          User Secrets
        </Typography>
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Box sx={{ mt: 4 }}>
      <Typography level="title-lg" mb={2} startDecorator={<KeyIcon />}>
        User Secrets
      </Typography>
      <Typography level="body-sm" color="neutral" mb={2}>
        User-specific secrets override team secrets. User secrets take
        precedence over team secrets with the same name.
      </Typography>

      {/* Special Secrets Section */}
      <SpecialSecretsSection isUser={true} />

      {/* Custom Secrets Section */}
      <Box sx={{ mt: 4 }}>
        <Typography level="title-md" mb={2}>
          Custom Secrets
        </Typography>
        <Typography level="body-sm" color="neutral" mb={2}>
          Custom secrets can be referenced in task configurations using the
          syntax <code>{'{{secret.<secret_name>}}'}</code>. The system will
          automatically replace these placeholders with the actual secret values
          when launching tasks.
        </Typography>
        <Alert color="primary" variant="soft" sx={{ mb: 2 }}>
          <Typography level="body-sm">
            <strong>Usage examples:</strong>
            <br />• In command:{' '}
            <code>python script.py --api-key {'{{secret.API_KEY}}'}</code>
            <br />• In setup: <code>export TOKEN={'{{secret.TOKEN}}'}</code>
            <br />• In env_vars:{' '}
            <code>
              {'{'} "API_KEY": "{'{{secret.API_KEY}}'}" {'}'}
            </code>
            <br />• In Python code: <code>lab.get_secret("API_KEY")</code>
            <br />
            <br />
            <strong>Note:</strong> Special secrets (_GITHUB_PAT_TOKEN,
            _HF_TOKEN, _WANDB_API_KEY) cannot be set here. Use the Special
            Secrets section above.
          </Typography>
        </Alert>

        {error && (
          <Alert color="danger" sx={{ mb: 2 }}>
            {error}
          </Alert>
        )}

        <Card variant="outlined" sx={{ p: 2, mb: 3 }}>
          {secrets.length === 0 ? (
            <Alert color="neutral" variant="soft" sx={{ mb: 2 }}>
              No secrets configured. Click "Add Secret" to add one.
            </Alert>
          ) : (
            <Table sx={{ tableLayout: 'auto', width: '100%' }}>
              <thead>
                <tr>
                  <th style={{ width: '20%' }}>Secret Key</th>
                  <th style={{ width: '40%' }}>Value</th>
                  <th style={{ width: '40%' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {secrets.map((secret, index) => (
                  <tr key={index}>
                    <td>
                      <Input
                        value={secret.key}
                        onChange={(e) =>
                          handleUpdateSecret(index, 'key', e.target.value)
                        }
                        placeholder="e.g. API_KEY"
                        disabled={
                          saving || (!secret.isNew && !secret.isEditing)
                        }
                        sx={{ width: '100%', maxWidth: '100%' }}
                      />
                    </td>
                    <td>
                      {secret.isNew || secret.isEditing ? (
                        <Input
                          type="password"
                          value={secret.value}
                          onChange={(e) =>
                            handleUpdateSecret(index, 'value', e.target.value)
                          }
                          placeholder="Enter secret value"
                          disabled={saving}
                          sx={{ width: '100%', maxWidth: '100%' }}
                        />
                      ) : (
                        <Stack direction="row" spacing={1} alignItems="center">
                          <Input value="••••••••" disabled sx={{ flex: 1 }} />
                          <IconButton
                            size="sm"
                            variant="plain"
                            onClick={() => handleViewSecret(secret.key)}
                            disabled={saving}
                          >
                            <EyeIcon size={16} />
                          </IconButton>
                        </Stack>
                      )}
                    </td>
                    <td>
                      <Stack
                        direction="row"
                        spacing={0.5}
                        sx={{ width: '100%' }}
                      >
                        {!secret.isNew && !secret.isEditing && (
                          <>
                            <IconButton
                              size="sm"
                              variant="plain"
                              onClick={() => handleEditSecret(index)}
                              disabled={saving}
                            >
                              <EditIcon size={16} />
                            </IconButton>
                            <IconButton
                              size="sm"
                              color="danger"
                              variant="plain"
                              onClick={() => handleRemoveSecret(index)}
                              disabled={saving}
                            >
                              <Trash2Icon size={16} />
                            </IconButton>
                          </>
                        )}
                        {(secret.isNew || secret.isEditing) && (
                          <>
                            <Button
                              size="sm"
                              variant="solid"
                              onClick={() => handleSaveSecret(index)}
                              disabled={
                                saving ||
                                !secret.key.trim() ||
                                !secret.value.trim()
                              }
                              loading={saving}
                              sx={{ minWidth: 60 }}
                            >
                              Save
                            </Button>
                            <Button
                              size="sm"
                              variant="plain"
                              onClick={() => {
                                if (secret.isNew) {
                                  handleRemoveSecret(index);
                                } else {
                                  handleCancelEdit(index);
                                }
                              }}
                              disabled={saving}
                              sx={{ minWidth: 60 }}
                            >
                              Cancel
                            </Button>
                          </>
                        )}
                      </Stack>
                    </td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}

          <Stack direction="row" spacing={2} sx={{ mt: 2 }}>
            <Button
              startDecorator={<PlusIcon />}
              onClick={handleAddSecret}
              disabled={saving}
              variant="outlined"
            >
              Add Secret
            </Button>
          </Stack>
        </Card>
      </Box>

      {/* View Secret Value Modal */}
      <Modal
        open={viewSecretModal.open && !!viewSecretModal.secretValue}
        onClose={() =>
          setViewSecretModal({ open: false, secretKey: '', secretValue: '' })
        }
      >
        <ModalDialog>
          <ModalClose />
          <DialogTitle>Secret Value: {viewSecretModal.secretKey}</DialogTitle>
          <DialogContent>
            <FormControl>
              <FormLabel>Secret Value</FormLabel>
              <Input
                value={viewSecretModal.secretValue}
                readOnly
                endDecorator={
                  <IconButton
                    onClick={() => {
                      navigator.clipboard.writeText(
                        viewSecretModal.secretValue,
                      );
                      alert('Secret copied to clipboard');
                    }}
                  >
                    <CopyIcon size={16} />
                  </IconButton>
                }
              />
            </FormControl>
            <Typography level="body-xs" color="warning" sx={{ mt: 1 }}>
              This value will not be shown again. Close this dialog to hide it.
            </Typography>
          </DialogContent>
          <DialogActions>
            <Button
              onClick={() =>
                setViewSecretModal({
                  open: false,
                  secretKey: '',
                  secretValue: '',
                })
              }
            >
              Close
            </Button>
          </DialogActions>
        </ModalDialog>
      </Modal>
    </Box>
  );
}
