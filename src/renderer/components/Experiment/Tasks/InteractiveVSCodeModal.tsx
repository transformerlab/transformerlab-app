import React from 'react';
import {
  Box,
  Button,
  Chip,
  CircularProgress,
  Divider,
  IconButton,
  Link,
  Modal,
  ModalClose,
  ModalDialog,
  Stack,
  Typography,
} from '@mui/joy';
import { CopyIcon, LogsIcon } from 'lucide-react';
import useSWR from 'swr';
import * as chatAPI from 'renderer/lib/transformerlab-api-sdk';
import { useExperimentInfo } from 'renderer/lib/ExperimentInfoContext';
import { fetcher } from 'renderer/lib/transformerlab-api-sdk';

type InteractiveVSCodeModalProps = {
  jobId: number;
  setJobId: (jobId: number) => void;
  onOpenOutput?: (jobId: number) => void;
};

export default function InteractiveVSCodeModal({
  jobId,
  setJobId,
  onOpenOutput,
}: InteractiveVSCodeModalProps) {
  const { experimentInfo } = useExperimentInfo();

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

  const authCode = data?.auth_code || null;
  const tunnelUrl = data?.tunnel_url || null;
  const isReady = Boolean(data?.is_ready);

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
            VS Code Interactive Session (Job {jobId})
          </Typography>
          <Typography level="body-sm" color="neutral">
            Follow the steps below to authenticate and open your VS Code session.
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
              {isReady ? 'Ready' : 'Waiting for connection'}
            </Chip>
            {isLoading && <CircularProgress size="sm" />}
            {error && (
              <Typography level="body-xs" color="danger">
                Failed to load connection info
              </Typography>
            )}
          </Stack>

          <Box>
            <Typography level="title-md">Step 1: Authorize VS Code</Typography>
            <Typography level="body-sm" sx={{ mt: 0.5 }}>
              When the VS Code service starts, it may print an authorization code.
              Copy the code below (when available), go to{' '}
              <Link
                href="https://github.com/login/device"
                target="_blank"
                rel="noreferrer"
              >
                https://github.com/login/device
              </Link>{' '}
              and complete the sign-in flow in your browser.
            </Typography>

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
              }}
            >
              <Typography
                level="h4"
                sx={{ fontFamily: 'monospace', letterSpacing: '0.12em' }}
              >
                {authCode || 'Waiting for auth code from provider logs...'}
              </Typography>
              <IconButton
                size="sm"
                variant="soft"
                onClick={() => handleCopy(authCode)}
                disabled={!authCode}
              >
                <CopyIcon size={16} />
              </IconButton>
            </Box>

            <Typography level="body-xs" sx={{ mt: 0.5 }}>
              Tip: If the code never appears, check the job output and provider
              logs to ensure the service started correctly.
            </Typography>
          </Box>

          <Divider />

          <Box>
            <Typography level="title-md">
              Step 2: Open VS Code
            </Typography>
            <Typography level="body-sm" sx={{ mt: 0.5 }}>
              After you finish authorization, the URL will appear here.
              Use it to open the remote environment in your browser-based VS
              Code.
            </Typography>

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
              }}
            >
              {tunnelUrl ? (
                <>
                  <Link
                    href={tunnelUrl}
                    target="_blank"
                    rel="noreferrer"
                    level="title-md"
                    sx={{ wordBreak: 'break-all' }}
                  >
                    {tunnelUrl}
                  </Link>
                  <Stack direction="row" spacing={1}>
                    <Button
                      size="sm"
                      variant="soft"
                      onClick={() => handleCopy(tunnelUrl)}
                    >
                      Copy URL
                    </Button>
                  </Stack>
                </>
              ) : (
                <Typography level="body-sm">
                  Waiting for VS Code to print a URL in the provider
                  logs...
                </Typography>
              )}
            </Box>
          </Box>
        </Box>
      </ModalDialog>
    </Modal>
  );
}
