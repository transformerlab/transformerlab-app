import {
  Alert,
  Box,
  Button,
  Card,
  CircularProgress,
  FormControl,
  FormLabel,
  Input,
  Modal,
  ModalDialog,
  ModalClose,
  DialogTitle,
  DialogContent,
  DialogActions,
  Option,
  Select,
  Stack,
  Typography,
} from '@mui/joy';
import { DatabaseIcon, Trash2Icon } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useAuth } from 'renderer/lib/authContext';

interface StorageProvider {
  id: string;
  name: string;
  type: string;
  config: Record<string, string>;
}

interface StorageProviderConfig {
  uri: string;
  aws_access_key_id?: string;
  aws_secret_access_key?: string;
  aws_profile?: string;
  google_application_credentials?: string;
  azure_storage_account?: string;
  azure_storage_key?: string;
  connection_string?: string;
}

const PROVIDER_TYPES = ['S3', 'GCS', 'AZURE', 'LOCALFS'];

export default function StorageProviderSection({ teamId }: { teamId: string }) {
  const { fetchWithAuth } = useAuth();
  const [provider, setProvider] = useState<StorageProvider | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<{
    success: boolean;
    error?: string;
  } | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const [formName, setFormName] = useState('');
  const [formType, setFormType] = useState<string>('S3');
  const [formConfig, setFormConfig] = useState<StorageProviderConfig>({
    uri: '',
  });

  useEffect(() => {
    if (!teamId) return;
    setLoading(true);
    setError(null);
    fetchWithAuth(`/storage_provider/`)
      .then((res) => res.json())
      .then((data) => setProvider(data))
      .catch(() => setError('Failed to load storage provider'))
      .finally(() => setLoading(false));
  }, [teamId, fetchWithAuth]);

  function resetForm() {
    setFormName('');
    setFormType('S3');
    setFormConfig({ uri: '' });
    setTestResult(null);
  }

  async function handleTest() {
    setTesting(true);
    setTestResult(null);
    try {
      const res = await fetchWithAuth(`/storage_provider/test`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: formType, config: formConfig }),
      });
      const data = await res.json();
      setTestResult(data);
    } catch {
      setTestResult({ success: false, error: 'Request failed' });
    } finally {
      setTesting(false);
    }
  }

  async function handleSave() {
    setSaving(true);
    setError(null);
    try {
      const res = await fetchWithAuth(`/storage_provider/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: formName,
          type: formType,
          config: formConfig,
        }),
      });
      if (!res.ok) {
        const err = await res.json();
        setError(err.detail || 'Failed to save storage provider');
        return;
      }
      setShowForm(false);
      resetForm();
      const data = await res.json();
      setProvider(data);
    } catch {
      setError('Failed to save storage provider');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!provider) return;
    try {
      await fetchWithAuth(`/storage_provider/${provider.id}`, {
        method: 'DELETE',
      });
      setProvider(null);
      setShowDeleteConfirm(false);
    } catch {
      setShowDeleteConfirm(false);
      setError('Failed to delete storage provider');
    }
  }

  if (loading) return <CircularProgress size="sm" />;

  return (
    <Box sx={{ mt: 2 }}>
      <Typography level="title-md" sx={{ mb: 1 }}>
        <DatabaseIcon
          size={16}
          style={{ marginRight: 6, verticalAlign: 'middle' }}
        />
        Job Storage Provider
      </Typography>
      <Typography level="body-sm" sx={{ mb: 2, color: 'neutral.500' }}>
        Configure where job outputs, checkpoints, and logs are stored. Affects
        all remote job launches.
      </Typography>

      {error && (
        <Alert color="danger" sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}

      {provider ? (
        <Card variant="outlined" sx={{ p: 2 }}>
          <Stack
            direction="row"
            justifyContent="space-between"
            alignItems="center"
          >
            <Box>
              <Typography level="title-sm">{provider.name}</Typography>
              <Typography level="body-xs" sx={{ color: 'neutral.500' }}>
                {provider.type} — {provider.config?.uri || '(no URI)'}
              </Typography>
            </Box>
            <Button
              color="danger"
              variant="outlined"
              size="sm"
              startDecorator={<Trash2Icon size={14} />}
              onClick={() => setShowDeleteConfirm(true)}
            >
              Delete
            </Button>
          </Stack>
        </Card>
      ) : (
        <Button
          variant="outlined"
          size="sm"
          onClick={() => {
            resetForm();
            setShowForm(true);
          }}
        >
          Configure Storage Provider
        </Button>
      )}

      {/* Configure Form Modal */}
      <Modal open={showForm} onClose={() => setShowForm(false)}>
        <ModalDialog sx={{ width: 480 }}>
          <ModalClose />
          <DialogTitle>Configure Storage Provider</DialogTitle>
          <DialogContent>
            <Stack spacing={2} sx={{ mt: 1 }}>
              <FormControl>
                <FormLabel>Name</FormLabel>
                <Input
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  placeholder="e.g. Team S3 Bucket"
                />
              </FormControl>

              <FormControl>
                <FormLabel>Type</FormLabel>
                <Select
                  value={formType}
                  onChange={(_, v) => {
                    if (v) setFormType(v);
                    setFormConfig({ uri: '' });
                  }}
                >
                  {PROVIDER_TYPES.map((t) => (
                    <Option key={t} value={t}>
                      {t}
                    </Option>
                  ))}
                </Select>
              </FormControl>

              <FormControl>
                <FormLabel>URI</FormLabel>
                <Input
                  value={formConfig.uri}
                  onChange={(e) =>
                    setFormConfig((c) => ({ ...c, uri: e.target.value }))
                  }
                  placeholder={
                    formType === 'S3'
                      ? 's3://my-bucket'
                      : formType === 'GCS'
                        ? 'gs://my-bucket'
                        : formType === 'AZURE'
                          ? 'abfs://my-container'
                          : '/mnt/nfs/storage'
                  }
                />
              </FormControl>

              {formType === 'S3' && (
                <>
                  <FormControl>
                    <FormLabel>AWS Access Key ID (optional)</FormLabel>
                    <Input
                      value={formConfig.aws_access_key_id || ''}
                      onChange={(e) =>
                        setFormConfig((c) => ({
                          ...c,
                          aws_access_key_id: e.target.value,
                        }))
                      }
                    />
                  </FormControl>
                  <FormControl>
                    <FormLabel>AWS Secret Access Key (optional)</FormLabel>
                    <Input
                      type="password"
                      value={formConfig.aws_secret_access_key || ''}
                      onChange={(e) =>
                        setFormConfig((c) => ({
                          ...c,
                          aws_secret_access_key: e.target.value,
                        }))
                      }
                    />
                  </FormControl>
                  <FormControl>
                    <FormLabel>
                      AWS Profile (optional, instead of keys)
                    </FormLabel>
                    <Input
                      value={formConfig.aws_profile || ''}
                      onChange={(e) =>
                        setFormConfig((c) => ({
                          ...c,
                          aws_profile: e.target.value,
                        }))
                      }
                    />
                  </FormControl>
                </>
              )}

              {formType === 'GCS' && (
                <FormControl>
                  <FormLabel>Service Account Key Path (optional)</FormLabel>
                  <Input
                    value={formConfig.google_application_credentials || ''}
                    onChange={(e) =>
                      setFormConfig((c) => ({
                        ...c,
                        google_application_credentials: e.target.value,
                      }))
                    }
                  />
                </FormControl>
              )}

              {formType === 'AZURE' && (
                <>
                  <FormControl>
                    <FormLabel>Connection String (optional)</FormLabel>
                    <Input
                      type="password"
                      value={formConfig.connection_string || ''}
                      onChange={(e) =>
                        setFormConfig((c) => ({
                          ...c,
                          connection_string: e.target.value,
                        }))
                      }
                    />
                  </FormControl>
                  <FormControl>
                    <FormLabel>
                      Storage Account (optional, instead of connection string)
                    </FormLabel>
                    <Input
                      value={formConfig.azure_storage_account || ''}
                      onChange={(e) =>
                        setFormConfig((c) => ({
                          ...c,
                          azure_storage_account: e.target.value,
                        }))
                      }
                    />
                  </FormControl>
                  <FormControl>
                    <FormLabel>Storage Key (optional)</FormLabel>
                    <Input
                      type="password"
                      value={formConfig.azure_storage_key || ''}
                      onChange={(e) =>
                        setFormConfig((c) => ({
                          ...c,
                          azure_storage_key: e.target.value,
                        }))
                      }
                    />
                  </FormControl>
                </>
              )}

              {testResult && (
                <Alert color={testResult.success ? 'success' : 'danger'}>
                  {testResult.success
                    ? 'Connection successful!'
                    : `Connection failed: ${testResult.error}`}
                </Alert>
              )}
            </Stack>
          </DialogContent>
          <DialogActions>
            <Button
              variant="outlined"
              size="sm"
              loading={testing}
              onClick={handleTest}
              disabled={!formConfig.uri}
            >
              Test Connection
            </Button>
            <Button
              size="sm"
              loading={saving}
              onClick={handleSave}
              disabled={!formName || !formConfig.uri}
            >
              Save
            </Button>
            <Button
              variant="plain"
              size="sm"
              onClick={() => setShowForm(false)}
            >
              Cancel
            </Button>
          </DialogActions>
        </ModalDialog>
      </Modal>

      {/* Delete Confirmation Modal */}
      <Modal
        open={showDeleteConfirm}
        onClose={() => setShowDeleteConfirm(false)}
      >
        <ModalDialog>
          <ModalClose />
          <DialogTitle>Delete Storage Provider?</DialogTitle>
          <DialogContent>
            <Typography>
              Deleting this storage provider means job outputs stored at this
              location will no longer be accessible from TransformerLab.{' '}
              <strong>The data itself is not deleted.</strong>
            </Typography>
          </DialogContent>
          <DialogActions>
            <Button color="danger" onClick={handleDelete}>
              Delete
            </Button>
            <Button variant="plain" onClick={() => setShowDeleteConfirm(false)}>
              Cancel
            </Button>
          </DialogActions>
        </ModalDialog>
      </Modal>
    </Box>
  );
}
