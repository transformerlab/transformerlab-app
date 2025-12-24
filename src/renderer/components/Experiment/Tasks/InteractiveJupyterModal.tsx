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

type InteractiveJupyterModalProps = {
  jobId: number;
  setJobId: (jobId: number) => void;
};

export default function InteractiveJupyterModal({
  jobId,
  setJobId,
}: InteractiveJupyterModalProps) {
  const { experimentInfo } = useExperimentInfo();

  const url = React.useMemo(() => {
    if (jobId === -1 || !experimentInfo?.id) {
      return null;
    }
    return chatAPI.Endpoints.Experiment.GetJupyterTunnelInfo(
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

  const jupyterUrl = data?.jupyter_url || null;
  const token = data?.token || null;
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
            Jupyter Notebook Interactive Session (Job {jobId})
          </Typography>
          <Typography level="body-sm" color="neutral">
            Access your Jupyter notebook through the tunnel URL below. The tunnel
            URL provides secure access without requiring a token.
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
            <Typography level="title-md">Access Jupyter Notebook</Typography>
            <Typography level="body-sm" sx={{ mt: 0.5 }}>
              Once the tunnel is ready, click the link below to open your
              Jupyter notebook in your browser. The tunnel URL provides secure
              access without requiring a token.
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
                flexWrap: 'wrap',
              }}
            >
              {jupyterUrl ? (
                <>
                  <Link
                    href={jupyterUrl}
                    target="_blank"
                    rel="noreferrer"
                    level="title-md"
                    sx={{ wordBreak: 'break-all', flex: 1, minWidth: 0 }}
                  >
                    {jupyterUrl}
                  </Link>
                  <Stack direction="row" spacing={1}>
                    <Button
                      size="sm"
                      variant="soft"
                      onClick={() => handleCopy(jupyterUrl)}
                    >
                      Copy URL
                    </Button>
                  </Stack>
                </>
              ) : (
                <Typography level="body-sm" sx={{ flex: 1 }}>
                  Waiting for tunnel to start. The URL will appear here once
                  cloudflared creates the tunnel...
                </Typography>
              )}
            </Box>

            {token && (
              <Typography level="body-xs" sx={{ mt: 0.5, color: 'neutral' }}>
                Token: <code>{token}</code> (automatically included in URL)
              </Typography>
            )}


            <Typography level="body-xs" sx={{ mt: 1 }}>
              Tip: If the URL never appears, check the job output and provider
              logs to ensure Jupyter and cloudflared started correctly.
            </Typography>
          </Box>

          <Divider />

          <Stack direction="row" spacing={1}>
            <Button
              size="sm"
              variant="outlined"
              startDecorator={<LogsIcon size={16} />}
              onClick={() => {
                // Reuse the existing output modal via the main Tasks page
                window.dispatchEvent(
                  new CustomEvent('tflab-open-job-output', {
                    detail: { jobId },
                  }),
                );
              }}
            >
              Open Output & Provider Logs
            </Button>
            <Box flex={1} />
          </Stack>
        </Box>
      </ModalDialog>
    </Modal>
  );
}
