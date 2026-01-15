import {
  Box,
  Button,
  Typography,
  Stack,
  CircularProgress,
  Alert,
  Card,
} from '@mui/joy';
import {
  KeyIcon,
  DownloadIcon,
} from 'lucide-react';
import { useState } from 'react';
import { useAuth } from 'renderer/lib/authContext';
import * as chatAPI from 'renderer/lib/transformerlab-api-sdk';

export default function SshKeySection({ teamId }: { teamId: string }) {
  const { fetchWithAuth } = useAuth();
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleDownloadSshKey = async () => {
    if (!teamId) {
      setError('Team ID is required');
      return;
    }

    setDownloading(true);
    setError(null);

    try {
      const response = await fetchWithAuth(
        chatAPI.Endpoints.ComputeProvider.DownloadSshKey(),
      );

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ detail: 'Failed to download SSH key' }));
        throw new Error(errorData.detail || 'Failed to download SSH key');
      }

      // Get the blob from the response
      const blob = await response.blob();
      
      // Create a temporary URL for the blob
      const url = window.URL.createObjectURL(blob);
      
      // Create a temporary anchor element and trigger download
      const a = document.createElement('a');
      a.href = url;
      a.download = `org_ssh_key_${teamId}`;
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

  return (
    <Box sx={{ mt: 4 }}>
      <Typography level="title-lg" mb={2} startDecorator={<KeyIcon />}>
        SSH Access Key
      </Typography>
      <Typography level="body-sm" color="neutral" mb={2}>
        Download your organization's SSH private key to access interactive SSH tasks
        launched via ngrok. The key is automatically generated when you launch your
        first SSH interactive task.
      </Typography>
      <Alert color="primary" variant="soft" sx={{ mb: 2 }}>
        <Typography level="body-sm">
          <strong>Usage:</strong>
          <br />• Download the key and save it securely (e.g., <code>~/.ssh/org_ssh_key</code>)
          <br />• Set permissions: <code>chmod 600 ~/.ssh/org_ssh_key</code>
          <br />• Use it to SSH into your interactive tasks: <code>ssh -i ~/.ssh/org_ssh_key user@host</code>
          <br />• The public key is automatically added to authorized_keys on launch
        </Typography>
      </Alert>

      {error && (
        <Alert color="danger" sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}

      <Card variant="outlined" sx={{ p: 2 }}>
        <Stack direction="row" spacing={2} alignItems="center">
          <Button
            startDecorator={<DownloadIcon />}
            onClick={handleDownloadSshKey}
            disabled={downloading || !teamId}
            loading={downloading}
            variant="outlined"
          >
            {downloading ? 'Downloading...' : 'Download SSH Key'}
          </Button>
          <Typography level="body-sm" color="neutral">
            The key will be downloaded as <code>org_ssh_key_{teamId}</code>
          </Typography>
        </Stack>
      </Card>
    </Box>
  );
}
