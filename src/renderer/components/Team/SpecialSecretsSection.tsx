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
  Select,
  Option,
} from '@mui/joy';
import { KeyIcon } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useAuth } from 'renderer/lib/authContext';
import { API_URL } from 'renderer/lib/api-client/urls';

interface SpecialSecretsSectionProps {
  teamId?: string;
  isUser?: boolean;
}

const SPECIAL_SECRET_TYPES = {
  _GITHUB_PAT_TOKEN: 'GitHub Personal Access Token',
  _HF_TOKEN: 'HuggingFace Token',
  _WANDB_API_KEY: 'Weights & Biases API Key',
};

export default function SpecialSecretsSection({
  teamId,
  isUser = false,
}: SpecialSecretsSectionProps) {
  const { fetchWithAuth } = useAuth();
  const [selectedSecretType, setSelectedSecretType] =
    useState<string>('_GITHUB_PAT_TOKEN');
  const [secretValue, setSecretValue] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [specialSecrets, setSpecialSecrets] = useState<
    Record<string, { exists: boolean; masked_value: string | null }>
  >({});

  useEffect(() => {
    const fetchSpecialSecrets = async () => {
      if ((!teamId && !isUser) || (teamId && isUser)) {
        setLoading(false);
        return;
      }
      try {
        setLoading(true);
        setError(null);
        const endpoint = isUser
          ? `${API_URL()}users/me/special_secrets`
          : `${API_URL()}teams/${teamId}/special_secrets`;
        const res = await fetchWithAuth(endpoint);

        if (res.ok) {
          const data = await res.json();
          setSpecialSecrets(data.special_secrets || {});
        } else {
          const errorData = await res.json();
          setError(errorData.detail || 'Failed to load special secrets');
        }
      } catch (err: any) {
        console.error('Error fetching special secrets:', err);
        setError('Failed to load special secrets');
      } finally {
        setLoading(false);
      }
    };

    fetchSpecialSecrets();
  }, [teamId, isUser, fetchWithAuth]);

  const handleSave = async () => {
    if (!secretValue.trim()) {
      setError('Secret value is required');
      return;
    }

    setSaving(true);
    setError(null);

    try {
      const endpoint = isUser
        ? `${API_URL()}users/me/special_secrets`
        : `${API_URL()}teams/${teamId}/special_secrets`;
      const res = await fetchWithAuth(endpoint, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          secret_type: selectedSecretType,
          value: secretValue,
        }),
      });

      if (res.ok) {
        // Refresh the special secrets list
        const getRes = await fetchWithAuth(endpoint);
        if (getRes.ok) {
          const getData = await getRes.json();
          setSpecialSecrets(getData.special_secrets || {});
        }
        setSecretValue('');
        setError(null);
      } else {
        const errorData = await res.json();
        setError(errorData.detail || 'Failed to save special secret');
      }
    } catch (err: any) {
      console.error('Error saving special secret:', err);
      setError('Failed to save special secret');
    } finally {
      setSaving(false);
    }
  };

  const handleRemove = async () => {
    if (
      !confirm(
        `Are you sure you want to remove the ${SPECIAL_SECRET_TYPES[selectedSecretType as keyof typeof SPECIAL_SECRET_TYPES]}?`,
      )
    ) {
      return;
    }

    setSaving(true);
    setError(null);

    try {
      const endpoint = isUser
        ? `${API_URL()}users/me/special_secrets`
        : `${API_URL()}teams/${teamId}/special_secrets`;
      const res = await fetchWithAuth(endpoint, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          secret_type: selectedSecretType,
          value: '',
        }),
      });

      if (res.ok) {
        // Refresh the special secrets list
        const getRes = await fetchWithAuth(endpoint);
        if (getRes.ok) {
          const getData = await getRes.json();
          setSpecialSecrets(getData.special_secrets || {});
        }
        setSecretValue('');
        setError(null);
      } else {
        const errorData = await res.json();
        setError(errorData.detail || 'Failed to remove special secret');
      }
    } catch (err: any) {
      console.error('Error removing special secret:', err);
      setError('Failed to remove special secret');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <Box sx={{ mt: 2 }}>
        <CircularProgress size="sm" />
      </Box>
    );
  }

  const currentSecret = specialSecrets[selectedSecretType];

  return (
    <Box sx={{ mt: 2 }}>
      <Typography
        level="title-md"
        mb={2}
        startDecorator={<KeyIcon size={16} />}
      >
        Special Secrets
      </Typography>
      <Typography level="body-sm" color="neutral" mb={2}>
        Manage special secrets that integrate with external services. These
        secrets are stored securely and can be referenced in tasks using{' '}
        <code>{'{{secret.<secret_name>}}'}</code>.
      </Typography>
      <Alert color="primary" variant="soft" sx={{ mb: 2 }}>
        <Typography level="body-sm">
          <strong>Reference these secrets in your tasks:</strong>
          <br />• GitHub PAT: <code>{'{{secret._GITHUB_PAT_TOKEN}}'}</code>
          <br />• HuggingFace Token: <code>{'{{secret._HF_TOKEN}}'}</code>
          <br />• Weights & Biases API Key:{' '}
          <code>{'{{secret._WANDB_API_KEY}}'}</code>
          <br />
          <br />
          Example:{' '}
          <code>huggingface-cli login --token {'{{secret._HF_TOKEN}}'}</code>
        </Typography>
      </Alert>

      {error && (
        <Alert color="danger" sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}

      <Stack spacing={2} maxWidth={500}>
        <FormControl>
          <FormLabel>Secret Type</FormLabel>
          <Select
            value={selectedSecretType}
            onChange={(_, value) => {
              setSelectedSecretType(value || '_GITHUB_PAT_TOKEN');
              setSecretValue('');
              setError(null);
            }}
          >
            {Object.entries(SPECIAL_SECRET_TYPES).map(([key, label]) => (
              <Option key={key} value={key}>
                {label}
              </Option>
            ))}
          </Select>
        </FormControl>

        {currentSecret?.exists && (
          <Alert color="success" variant="soft">
            {
              SPECIAL_SECRET_TYPES[
                selectedSecretType as keyof typeof SPECIAL_SECRET_TYPES
              ]
            }{' '}
            is configured. Last 4 characters: {currentSecret.masked_value}
          </Alert>
        )}

        <FormControl>
          <FormLabel>
            {
              SPECIAL_SECRET_TYPES[
                selectedSecretType as keyof typeof SPECIAL_SECRET_TYPES
              ]
            }
          </FormLabel>
          <Input
            type="password"
            placeholder={
              currentSecret?.exists
                ? 'Enter new value to update'
                : `Enter ${SPECIAL_SECRET_TYPES[selectedSecretType as keyof typeof SPECIAL_SECRET_TYPES]}`
            }
            value={secretValue}
            onChange={(e) => setSecretValue(e.target.value)}
            disabled={saving}
            sx={{ fontFamily: 'monospace' }}
          />
        </FormControl>

        <Stack direction="row" spacing={2}>
          <Button
            variant="solid"
            onClick={handleSave}
            disabled={saving || !secretValue.trim()}
            loading={saving}
          >
            {currentSecret?.exists ? 'Update' : 'Save'}
          </Button>
          {currentSecret?.exists && (
            <Button
              variant="outlined"
              color="danger"
              onClick={handleRemove}
              disabled={saving}
            >
              Remove
            </Button>
          )}
        </Stack>
      </Stack>
    </Box>
  );
}
