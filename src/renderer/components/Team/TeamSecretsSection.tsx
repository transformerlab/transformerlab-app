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
} from '@mui/joy';
import { KeyIcon, PlusIcon, Trash2Icon } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useAuth } from 'renderer/lib/authContext';
import * as chatAPI from 'renderer/lib/transformerlab-api-sdk';

interface SecretEntry {
  key: string;
  value: string;
  isNew?: boolean;
}

export default function TeamSecretsSection({ teamId }: { teamId: string }) {
  const { fetchWithAuth } = useAuth();
  const [secrets, setSecrets] = useState<SecretEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchSecrets = async () => {
      if (!teamId) {
        setLoading(false);
        return;
      }
      try {
        setLoading(true);
        setError(null);
        const res = await fetchWithAuth(chatAPI.Endpoints.Teams.GetSecrets(teamId));

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
          setError(errorData.detail || 'Failed to load team secrets');
        }
      } catch (err: any) {
        console.error('Error fetching secrets:', err);
        setError('Failed to load team secrets');
      } finally {
        setLoading(false);
      }
    };

    fetchSecrets();
  }, [teamId, fetchWithAuth]);

  const handleAddSecret = () => {
    setSecrets([...secrets, { key: '', value: '', isNew: true }]);
  };

  const handleRemoveSecret = (index: number) => {
    setSecrets(secrets.filter((_, i) => i !== index));
  };

  const handleUpdateSecret = (index: number, field: 'key' | 'value', newValue: string) => {
    const updated = [...secrets];
    updated[index] = { ...updated[index], [field]: newValue };
    setSecrets(updated);
  };

  const handleSave = async () => {
    // Validate all secrets have keys
    const invalidSecrets = secrets.filter((s) => !s.key.trim());
    if (invalidSecrets.length > 0) {
      setError('All secrets must have a key');
      return;
    }

    // Validate key format (must be valid env var name)
    const keyPattern = /^[A-Za-z_][A-Za-z0-9_]*$/;
    const invalidKeys = secrets.filter((s) => !keyPattern.test(s.key));
    if (invalidKeys.length > 0) {
      setError(
        'Secret keys must start with a letter or underscore and contain only letters, numbers, and underscores',
      );
      return;
    }

    // Check for duplicate keys
    const keys = secrets.map((s) => s.key);
    const duplicates = keys.filter((key, index) => keys.indexOf(key) !== index);
    if (duplicates.length > 0) {
      setError('Duplicate secret keys are not allowed');
      return;
    }

    setSaving(true);
    setError(null);

    try {
      // Build secrets object (only include non-empty values)
      const secretsObj: Record<string, string> = {};
      for (const secret of secrets) {
        if (secret.key.trim()) {
          secretsObj[secret.key] = secret.value;
        }
      }

      const res = await fetchWithAuth(chatAPI.Endpoints.Teams.SetSecrets(teamId), {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ secrets: secretsObj }),
      });

      if (res.ok) {
        const data = await res.json();
        // Update secrets list (remove isNew flags, clear values for security)
        const updatedSecrets: SecretEntry[] = (data.secret_keys || []).map(
          (key: string) => ({
            key,
            value: '', // Don't show values after saving
          }),
        );
        setSecrets(updatedSecrets);
        alert('Team secrets saved successfully');
      } else {
        const errorData = await res.json();
        setError(errorData.detail || 'Failed to save team secrets');
      }
    } catch (err: any) {
      console.error('Error saving secrets:', err);
      setError('Failed to save team secrets');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <Box sx={{ mt: 4 }}>
        <Typography level="title-lg" mb={1} startDecorator={<KeyIcon />}>
          Team Secrets
        </Typography>
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Box sx={{ mt: 4 }}>
      <Typography level="title-lg" mb={2} startDecorator={<KeyIcon />}>
        Team Secrets
      </Typography>
      <Typography level="body-sm" color="neutral" mb={2}>
        Secrets are automatically injected into all launched tasks as environment
        variables with the prefix <code>TLAB_SECRET_</code>. For example, a secret
        named <code>API_KEY</code> will be available as{' '}
        <code>TLAB_SECRET_API_KEY</code>.
      </Typography>

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
          <Table>
            <thead>
              <tr>
                <th>Secret Key</th>
                <th>Value</th>
                <th style={{ width: 50 }}></th>
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
                      disabled={saving}
                      sx={{ minWidth: 200 }}
                    />
                  </td>
                  <td>
                    <Input
                      type="password"
                      value={secret.value}
                      onChange={(e) =>
                        handleUpdateSecret(index, 'value', e.target.value)
                      }
                      placeholder={
                        secret.isNew ? 'Enter secret value' : '••••••••'
                      }
                      disabled={saving}
                      sx={{ minWidth: 300 }}
                    />
                  </td>
                  <td>
                    <IconButton
                      color="danger"
                      variant="plain"
                      onClick={() => handleRemoveSecret(index)}
                      disabled={saving}
                    >
                      <Trash2Icon size={16} />
                    </IconButton>
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
          <Button
            onClick={handleSave}
            disabled={saving || secrets.length === 0}
            loading={saving}
          >
            Save Secrets
          </Button>
        </Stack>
      </Card>
    </Box>
  );
}

