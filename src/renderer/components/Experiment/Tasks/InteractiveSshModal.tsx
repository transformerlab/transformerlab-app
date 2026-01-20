import React from 'react';
import {
  Box,
  Button,
  Chip,
  CircularProgress,
  Divider,
  Link,
  Modal,
  ModalClose,
  ModalDialog,
  Stack,
  Typography,
} from '@mui/joy';
import { LogsIcon } from 'lucide-react';
import useSWR from 'swr';
import * as chatAPI from 'renderer/lib/transformerlab-api-sdk';
import { useExperimentInfo } from 'renderer/lib/ExperimentInfoContext';
import { fetcher } from 'renderer/lib/transformerlab-api-sdk';
import { useAuth } from 'renderer/lib/authContext';

type InteractiveSshModalProps = {
  jobId: number;
  setJobId: (jobId: number) => void;
  onOpenOutput?: (jobId: number) => void;
};

export default function InteractiveSshModal({
  jobId,
  setJobId,
  onOpenOutput,
}: InteractiveSshModalProps) {
  const { experimentInfo } = useExperimentInfo();
  const { team } = useAuth();

  const url = React.useMemo(() => {
    if (jobId === -1 || !experimentInfo?.id) {
      return null;
    }
    return chatAPI.Endpoints.Experiment.GetTunnelInfo(
      experimentInfo.id,
      String(jobId),
    );
  }, [experimentInfo?.id, jobId]);

  const {
    data,
    isLoading,
    error,
  }: {
    data: any;
    isLoading: boolean;
    error: any;
  } = useSWR(url, fetcher, {
    refreshInterval: 3000,
    revalidateOnFocus: true,
  });

  const handleClose = () => {
    setJobId(-1);
  };

  const handleCopy = (text: string | undefined | null) => {
    if (!text) return;
    try {
      navigator.clipboard?.writeText(text);
    } catch {
      // ignore copy failures
    }
  };

  if (jobId === -1 || !experimentInfo) {
    return null;
  }

  const domain = data?.domain || null;
  const port = data?.port || null;
  const username = data?.username || null;
  const baseSshCommand = data?.ssh_command || null;
  const isReady = Boolean(data?.is_ready);

  // Modify SSH command to include the org SSH key if team is available
  const sshCommand = React.useMemo(() => {
    if (!baseSshCommand || !team?.id) {
      return baseSshCommand;
    }
    // Insert -i flag after ssh and before -p or username
    // Pattern: ssh -p {port} {username}@{domain}
    // Should become: ssh -i ~/org_ssh_key_{teamId} -p {port} {username}@{domain}
    const sshKeyPath = `~/org_ssh_key_${team.id}`;
    // Check if -i is already in the command
    if (baseSshCommand.includes('-i')) {
      return baseSshCommand;
    }
    // Insert -i flag after 'ssh'
    return baseSshCommand.replace(/^ssh\s+/, `ssh -i ${sshKeyPath} `);
  }, [baseSshCommand, team?.id]);

  return (
    <Modal open={jobId !== -1} onClose={handleClose}>
      <ModalDialog
        sx={{
          maxWidth: '700px',
          width: '90vw',
          maxHeight: '80vh',
          overflow: 'hidden',
        }}
      >
        <ModalClose />
        <Stack spacing={1} sx={{ mb: 1 }}>
          <Typography level="title-lg">
            SSH Tunnel Interactive Session (Job {jobId})
          </Typography>
          <Typography level="body-sm" color="neutral">
            Access your remote machine via SSH through the ngrok tunnel. Use the
            SSH command below to connect. You'll need to download your
            organization's SSH key from Team Settings first.
          </Typography>
        </Stack>
        <Divider />
        <Box
          sx={{
            mt: 2,
            display: 'flex',
            flexDirection: 'column',
            gap: 2,
            maxHeight: '60vh',
            overflow: 'auto',
          }}
        >
          <Stack direction="row" spacing={1} alignItems="center">
            <Chip color={isReady ? 'success' : 'warning'} variant="soft">
              {isReady ? 'Ready' : 'Waiting for tunnel'}
            </Chip>
            {isLoading && <CircularProgress size="sm" />}
            {error && (
              <Typography level="body-xs" color="danger">
                Failed to load tunnel info
              </Typography>
            )}
          </Stack>

          <Box>
            <Typography level="title-md">SSH Connection Details</Typography>
            <Typography level="body-sm" sx={{ mt: 0.5 }}>
              Once the tunnel is ready, use the SSH command below to connect to
              your remote machine.
            </Typography>

            {domain && port && (
              <Box sx={{ mt: 2 }}>
                <Typography level="body-sm" sx={{ mb: 1, fontWeight: 'bold' }}>
                  Connection Information:
                </Typography>
                <Stack spacing={0.5} sx={{ mb: 2 }}>
                  <Typography level="body-xs">
                    Domain: <code>{domain}</code>
                  </Typography>
                  <Typography level="body-xs">
                    Port: <code>{port}</code>
                  </Typography>
                  {username && (
                    <Typography level="body-xs">
                      Username: <code>{username}</code>
                    </Typography>
                  )}
                </Stack>
              </Box>
            )}

            <Box
              sx={{
                mt: 1,
                p: 1.5,
                borderRadius: 'sm',
                border: '1px solid var(--joy-palette-neutral-outlinedBorder)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 1,
                flexWrap: 'wrap',
                bgcolor: 'background.level1',
              }}
            >
              {sshCommand ? (
                <>
                  <Typography
                    level="body-md"
                    component="code"
                    sx={{
                      fontFamily: 'monospace',
                      wordBreak: 'break-all',
                      flex: 1,
                      minWidth: 0,
                    }}
                  >
                    {sshCommand}
                  </Typography>
                  <Stack direction="row" spacing={1}>
                    <Button
                      size="sm"
                      variant="soft"
                      onClick={() => handleCopy(sshCommand)}
                    >
                      Copy Command
                    </Button>
                  </Stack>
                </>
              ) : (
                <Typography level="body-sm" sx={{ flex: 1 }}>
                  Waiting for tunnel to start. The SSH command will appear here
                  once ngrok creates the tunnel...
                </Typography>
              )}
            </Box>

            {sshCommand && (
              <Box
                sx={{
                  mt: 2,
                  p: 1.5,
                  bgcolor: 'background.level1',
                  borderRadius: 'sm',
                }}
              >
                <Typography level="body-sm" sx={{ mb: 1, fontWeight: 'bold' }}>
                  Usage Instructions:
                </Typography>
                <Typography
                  level="body-xs"
                  component="pre"
                  sx={{
                    fontFamily: 'monospace',
                    whiteSpace: 'pre-wrap',
                    wordBreak: 'break-all',
                    fontSize: '0.75rem',
                  }}
                >
                  {`1. Download your organization's SSH key from Team Settings
2. Save the key file (e.g., ~/org_ssh_key_${team?.id || 'YOUR_TEAM_ID'})
3. Set permissions: chmod 600 ~/org_ssh_key_${team?.id || 'YOUR_TEAM_ID'}
4. Copy the SSH command above
5. Open your terminal
6. Paste and run the command`}
                </Typography>
              </Box>
            )}

            <Typography level="body-xs" sx={{ mt: 1 }}>
              Tip: If the command never appears, check the job output and
              provider logs to ensure ngrok started correctly.
            </Typography>
          </Box>
        </Box>
      </ModalDialog>
    </Modal>
  );
}
