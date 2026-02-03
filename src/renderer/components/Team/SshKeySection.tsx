import {
  Box,
  Button,
  Typography,
  Stack,
  CircularProgress,
  Alert,
  Card,
  Input,
  Modal,
  ModalDialog,
  ModalClose,
  DialogTitle,
  DialogContent,
  DialogActions,
} from '@mui/joy';
import {
  KeyIcon,
  DownloadIcon,
  PlusIcon,
  TrashIcon,
  EditIcon,
} from 'lucide-react';
import { useState, useEffect } from 'react';
import { useAuth } from 'renderer/lib/authContext';
import * as chatAPI from 'renderer/lib/transformerlab-api-sdk';

interface SshKey {
  id: string;
  name: string | null;
  created_at: string;
  created_by_user_id: string;
}

export default function SshKeySection({ teamId }: { teamId: string }) {
  const { fetchWithAuth } = useAuth();
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [key, setKey] = useState<SshKey | null>(null);
  const [loading, setLoading] = useState(true);
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [newKeyName, setNewKeyName] = useState('');
  const [creating, setCreating] = useState(false);
  const [updating, setUpdating] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const loadKey = async () => {
    if (!teamId) return;

    setLoading(true);
    setError(null);

    try {
      const response = await fetchWithAuth(chatAPI.Endpoints.SshKeys.Get());

      if (!response.ok) {
        if (response.status === 404) {
          // No key exists yet, that's fine
          setKey(null);
          return;
        }
        const errorData = await response
          .json()
          .catch(() => ({ detail: 'Failed to load SSH key' }));
        throw new Error(errorData.detail || 'Failed to load SSH key');
      }

      const data = await response.json();
      setKey(data);
    } catch (err: any) {
      console.error('Error loading SSH key:', err);
      setError(err.message || 'Failed to load SSH key');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadKey();
  }, [teamId]);

  const handleDownloadSshKey = async () => {
    if (!teamId) {
      setError('Team ID is required');
      return;
    }

    setDownloading(true);
    setError(null);

    try {
      const response = await fetchWithAuth(
        chatAPI.Endpoints.SshKeys.Download(),
      );

      if (!response.ok) {
        const errorData = await response
          .json()
          .catch(() => ({ detail: 'Failed to download SSH key' }));
        throw new Error(errorData.detail || 'Failed to download SSH key');
      }

      // Get the blob from the response
      const blob = await response.blob();

      // Create a temporary URL for the blob
      const url = window.URL.createObjectURL(blob);

      // Create a temporary anchor element and trigger download
      const a = document.createElement('a');
      a.href = url;
      const filename = key ? `org_ssh_key_${key.id}` : `org_ssh_key_${teamId}`;
      a.download = filename;
      document.body.appendChild(a);
      a.click();

      // Cleanup
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (err: any) {
      console.error('Error downloading SSH key:', err);
      setError(err.message || 'Failed to download SSH key');
    } finally {
      setDownloading(false);
    }
  };

  const handleCreateKey = async () => {
    if (!teamId) {
      setError('Team ID is required');
      return;
    }

    setCreating(true);
    setError(null);

    try {
      const response = await fetchWithAuth(chatAPI.Endpoints.SshKeys.Create(), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: newKeyName || null,
        }),
      });

      if (!response.ok) {
        const errorData = await response
          .json()
          .catch(() => ({ detail: 'Failed to create SSH key' }));
        throw new Error(errorData.detail || 'Failed to create SSH key');
      }

      setCreateModalOpen(false);
      setNewKeyName('');
      await loadKey();
    } catch (err: any) {
      console.error('Error creating SSH key:', err);
      setError(err.message || 'Failed to create SSH key');
    } finally {
      setCreating(false);
    }
  };

  const handleUpdateKey = async () => {
    if (!teamId || !key) return;

    setUpdating(true);
    setError(null);

    try {
      const response = await fetchWithAuth(chatAPI.Endpoints.SshKeys.Update(), {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: newKeyName || null,
        }),
      });

      if (!response.ok) {
        const errorData = await response
          .json()
          .catch(() => ({ detail: 'Failed to update SSH key' }));
        throw new Error(errorData.detail || 'Failed to update SSH key');
      }

      setEditModalOpen(false);
      setNewKeyName('');
      await loadKey();
    } catch (err: any) {
      console.error('Error updating SSH key:', err);
      setError(err.message || 'Failed to update SSH key');
    } finally {
      setUpdating(false);
    }
  };

  const handleDeleteKey = async () => {
    if (!teamId || !key) return;
    if (
      !confirm(
        'Are you sure you want to delete this SSH key? This action cannot be undone.',
      )
    ) {
      return;
    }

    setDeleting(true);
    setError(null);

    try {
      const response = await fetchWithAuth(chatAPI.Endpoints.SshKeys.Delete(), {
        method: 'DELETE',
      });

      if (!response.ok) {
        const errorData = await response
          .json()
          .catch(() => ({ detail: 'Failed to delete SSH key' }));
        throw new Error(errorData.detail || 'Failed to delete SSH key');
      }

      await loadKey();
    } catch (err: any) {
      console.error('Error deleting SSH key:', err);
      setError(err.message || 'Failed to delete SSH key');
    } finally {
      setDeleting(false);
    }
  };

  return (
    <Box sx={{ mt: 4 }}>
      <Stack
        direction="row"
        justifyContent="space-between"
        alignItems="center"
        mb={2}
      >
        <Typography level="title-lg" startDecorator={<KeyIcon />}>
          SSH Access Key
        </Typography>
        {key ? (
          <Stack direction="row" spacing={1}>
            <Button
              startDecorator={<EditIcon />}
              onClick={() => {
                setNewKeyName(key.name || '');
                setEditModalOpen(true);
              }}
              size="sm"
              variant="outlined"
            >
              Edit Name
            </Button>
            <Button
              startDecorator={<PlusIcon />}
              onClick={() => {
                setNewKeyName('');
                setCreateModalOpen(true);
              }}
              size="sm"
            >
              Replace Key
            </Button>
          </Stack>
        ) : (
          <Button
            startDecorator={<PlusIcon />}
            onClick={() => setCreateModalOpen(true)}
            size="sm"
          >
            Create Key
          </Button>
        )}
      </Stack>
      <Typography level="body-sm" color="neutral" mb={2}>
        Your organization has one SSH key for accessing interactive SSH tasks.
        The key is automatically added to authorized_keys when launching SSH
        tasks.
      </Typography>
      <Alert color="primary" variant="soft" sx={{ mb: 2 }}>
        <Typography level="body-sm">
          <strong>Usage:</strong>
          <br />• Download the key and save it in your home directory (
          <code>~</code>) with the downloaded filename (e.g.,{' '}
          <code>~/org_ssh_key_{key?.id || teamId}</code>)
          <br />• Set permissions:{' '}
          <code>chmod 600 ~/org_ssh_key_{key?.id || teamId}</code>
          <br />• Use it to SSH into your interactive tasks (the SSH panel will
          show the exact command with this path)
        </Typography>
      </Alert>

      {error && (
        <Alert color="danger" sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}

      {loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}>
          <CircularProgress />
        </Box>
      ) : key ? (
        <Card variant="outlined" sx={{ p: 2 }}>
          <Stack spacing={2}>
            <Stack
              direction="row"
              justifyContent="space-between"
              alignItems="center"
            >
              <Box>
                <Typography level="title-sm">
                  {key.name || `Key ${key.id.slice(0, 8)}`}
                </Typography>
                <Typography level="body-sm" color="neutral">
                  Created {new Date(key.created_at).toLocaleDateString()}
                </Typography>
              </Box>
              <Stack direction="row" spacing={1}>
                <Button
                  startDecorator={<DownloadIcon />}
                  onClick={handleDownloadSshKey}
                  disabled={downloading}
                  loading={downloading}
                  variant="outlined"
                  size="sm"
                >
                  Download
                </Button>
                <Button
                  startDecorator={<TrashIcon />}
                  onClick={handleDeleteKey}
                  disabled={deleting}
                  loading={deleting}
                  color="danger"
                  variant="outlined"
                  size="sm"
                >
                  Delete
                </Button>
              </Stack>
            </Stack>
          </Stack>
        </Card>
      ) : (
        <Card variant="outlined" sx={{ p: 3, textAlign: 'center' }}>
          <Typography level="body-md" color="neutral" mb={2}>
            No SSH key found. Create your first key to get started.
          </Typography>
          <Button
            startDecorator={<PlusIcon />}
            onClick={() => setCreateModalOpen(true)}
          >
            Create SSH Key
          </Button>
        </Card>
      )}

      <Modal open={createModalOpen} onClose={() => setCreateModalOpen(false)}>
        <ModalDialog>
          <ModalClose />
          <DialogTitle>Create New SSH Key</DialogTitle>
          <DialogContent>
            <Stack spacing={2} sx={{ mt: 2 }}>
              <Input
                placeholder="Key name (optional)"
                value={newKeyName}
                onChange={(e) => setNewKeyName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !creating) {
                    handleCreateKey();
                  }
                }}
              />
              {key && (
                <Alert color="warning" variant="soft">
                  <Typography level="body-sm">
                    Creating a new key will replace the existing key. The old
                    key will be deleted and cannot be recovered.
                  </Typography>
                </Alert>
              )}
            </Stack>
          </DialogContent>
          <DialogActions>
            <Button
              variant="outlined"
              onClick={() => {
                setCreateModalOpen(false);
                setNewKeyName('');
              }}
              disabled={creating}
            >
              Cancel
            </Button>
            <Button
              onClick={handleCreateKey}
              loading={creating}
              disabled={creating}
            >
              Create Key
            </Button>
          </DialogActions>
        </ModalDialog>
      </Modal>

      <Modal open={editModalOpen} onClose={() => setEditModalOpen(false)}>
        <ModalDialog>
          <ModalClose />
          <DialogTitle>Edit SSH Key Name</DialogTitle>
          <DialogContent>
            <Stack spacing={2} sx={{ mt: 2 }}>
              <Input
                placeholder="Key name (optional)"
                value={newKeyName}
                onChange={(e) => setNewKeyName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !updating) {
                    handleUpdateKey();
                  }
                }}
              />
            </Stack>
          </DialogContent>
          <DialogActions>
            <Button
              variant="outlined"
              onClick={() => {
                setEditModalOpen(false);
                setNewKeyName('');
              }}
              disabled={updating}
            >
              Cancel
            </Button>
            <Button
              onClick={handleUpdateKey}
              loading={updating}
              disabled={updating}
            >
              Save
            </Button>
          </DialogActions>
        </ModalDialog>
      </Modal>
    </Box>
  );
}
